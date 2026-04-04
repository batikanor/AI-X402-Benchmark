#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { BenchmarkRunner } from '../src/core/runner.js';
import { Logger } from '../src/utils/logger.js';

function parseArgs(argv) {
  const options = {
    config: 'config/benchmark.config.json',
    models: '',
    outdir: 'readiness_bench/results',
    api: 'http://127.0.0.1:11434/api/generate',
    runsPerScenario: 1,
    maxTokens: 512,
    temperature: 0.1,
    integrationBaseUrl: '',
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }

    const [flag, inlineValue] = arg.split('=', 2);
    const next = inlineValue ?? argv[i + 1];
    const value = inlineValue ?? (next && !next.startsWith('--') ? next : undefined);
    if (!inlineValue && value !== undefined) {
      i += 1;
    }

    switch (flag) {
      case '--config':
        if (!value) throw new Error('--config requires a value');
        options.config = value;
        break;
      case '--models':
        if (!value) throw new Error('--models requires a value');
        options.models = value;
        break;
      case '--outdir':
        if (!value) throw new Error('--outdir requires a value');
        options.outdir = value;
        break;
      case '--api':
        if (!value) throw new Error('--api requires a value');
        options.api = value;
        break;
      case '--runs-per-scenario':
        if (!value) throw new Error('--runs-per-scenario requires a value');
        options.runsPerScenario = Number(value);
        break;
      case '--max-tokens':
        if (!value) throw new Error('--max-tokens requires a value');
        options.maxTokens = Number(value);
        break;
      case '--temperature':
        if (!value) throw new Error('--temperature requires a value');
        options.temperature = Number(value);
        break;
      case '--integration-base-url':
        if (!value) throw new Error('--integration-base-url requires a value');
        options.integrationBaseUrl = value;
        break;
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }

  if (!Number.isInteger(options.runsPerScenario) || options.runsPerScenario < 1 || options.runsPerScenario > 3) {
    throw new Error('runsPerScenario must be an integer between 1 and 3.');
  }

  if (!Number.isInteger(options.maxTokens) || options.maxTokens < 64 || options.maxTokens > 4096) {
    throw new Error('maxTokens must be an integer between 64 and 4096.');
  }

  if (Number.isNaN(options.temperature) || options.temperature < 0 || options.temperature > 1) {
    throw new Error('temperature must be between 0 and 1.');
  }

  return options;
}

function round(value, digits = 2) {
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (sorted.length - 1) * (p / 100);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const w = rank - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function normalizeDecision(value) {
  const text = String(value || '').trim().toLowerCase();
  if (['allow', 'approved', 'approve', 'permit', 'yes'].includes(text)) return 'allow';
  if (['block', 'reject', 'deny', 'no'].includes(text)) return 'block';
  return 'unknown';
}

function normalizeBool(value) {
  if (typeof value === 'boolean') return value;
  const text = String(value || '').trim().toLowerCase();
  if (['true', 'yes', 'required', '1'].includes(text)) return true;
  if (['false', 'no', 'not_required', '0'].includes(text)) return false;
  return null;
}

function normalizePriority(value) {
  const text = String(value || '').trim().toLowerCase();
  if (['low', 'standard', 'high', 'critical'].includes(text)) return text;
  return 'unknown';
}

function extractJsonObject(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function parseModelDecision(rawOutput) {
  const parsed = extractJsonObject(rawOutput);
  if (!parsed || typeof parsed !== 'object') {
    return {
      parseOk: false,
      decision: 'unknown',
      approvalRequired: null,
      priority: 'unknown',
      reason: 'Unable to parse JSON decision output',
    };
  }

  const decision = normalizeDecision(parsed.decision);
  const approvalRequired = normalizeBool(parsed.approvalRequired);
  const priority = normalizePriority(parsed.priority);
  const reason = String(parsed.reason || '').trim() || 'No reason provided';

  const parseOk = decision !== 'unknown' && approvalRequired !== null && priority !== 'unknown';

  return {
    parseOk,
    decision,
    approvalRequired,
    priority,
    reason,
  };
}

function expectedDecision(policy, scenario) {
  const blockedCountries = new Set(policy?.blockedCountries || []);
  const threshold = Number(policy?.highValueThresholdUsd || 0);
  const amount = Number(scenario?.payment?.amountUsd || 0);
  const country = String(scenario?.payment?.destinationCountry || '').trim();

  const blocked = country && blockedCountries.has(country);
  const allow = !blocked;
  const approvalRequired = allow && amount >= threshold;
  const priority = normalizePriority(scenario?.workflowInput?.priority || 'standard');

  return {
    allow,
    approvalRequired,
    priority,
    explanation: blocked
      ? `Destination country ${country} is blocked by policy.`
      : approvalRequired
        ? `Amount ${amount} is above threshold ${threshold}; approval required.`
        : `Amount ${amount} is within threshold ${threshold}.`,
  };
}

function evaluateDecision(expected, parsed) {
  const expectedDecisionText = expected.allow ? 'allow' : 'block';
  const decisionMatch = parsed.decision === expectedDecisionText;
  const approvalMatch = parsed.approvalRequired === expected.approvalRequired;
  const priorityMatch = parsed.priority === expected.priority;

  const matched = [decisionMatch, approvalMatch, priorityMatch].filter(Boolean).length;
  const accuracyPct = round((matched / 3) * 100, 2);
  const fullMatch = decisionMatch && approvalMatch && priorityMatch;
  const executionEligible = fullMatch && expected.allow;

  return {
    decisionMatch,
    approvalMatch,
    priorityMatch,
    fullMatch,
    accuracyPct,
    executionEligible,
  };
}

function buildPrompt({ scenario, expected }) {
  const payment = scenario.payment || {};
  const workflowInput = scenario.workflowInput || {};
  return [
    'You are a payment policy decision engine for blockchain workflow routing.',
    'Return ONLY valid JSON with this exact schema and no markdown:',
    '{"decision":"allow|block","approvalRequired":true|false,"priority":"low|standard|high|critical","reason":"<short reason>"}',
    '',
    'Rules:',
    `- If destination country is blocked by policy, decision must be block and approvalRequired must be false.`,
    `- If amount is above threshold and not blocked, decision should be allow and approvalRequired should be true.`,
    `- Keep priority aligned with the incoming request priority (${expected.priority}).`,
    '',
    `Scenario: ${scenario.name}`,
    `Amount USD: ${payment.amountUsd}`,
    `Destination country: ${payment.destinationCountry}`,
    `Recipient account: ${payment.recipientAccountId}`,
    `Requested service: ${workflowInput.service || 'unknown'}`,
    `Requested priority: ${workflowInput.priority || 'standard'}`,
    `Policy explanation hint: ${expected.explanation}`,
  ].join('\n');
}

async function callModel({ api, model, prompt, maxTokens, temperature }) {
  const started = performance.now();
  const response = await fetch(api, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: {
        num_predict: maxTokens,
        temperature,
      },
    }),
  });
  const latencyMs = round(performance.now() - started);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama error ${response.status}: ${body}`);
  }

  const payload = await response.json();
  return {
    output: String(payload.response || ''),
    latencyMs,
    doneReason: payload.done_reason || null,
  };
}

function modelSummaryRows(results, scenariosPerModel) {
  const byModel = new Map();
  for (const row of results) {
    if (!byModel.has(row.model)) {
      byModel.set(row.model, []);
    }
    byModel.get(row.model).push(row);
  }

  const summaries = [];
  for (const [model, rows] of byModel.entries()) {
    const decisionAcc = rows.map((r) => r.evaluation.accuracyPct);
    const fullMatches = rows.filter((r) => r.evaluation.fullMatch).length;
    const executionEligible = rows.filter((r) => r.evaluation.executionEligible).length;
    const executed = rows.filter((r) => r.workflow.executed).length;
    const executionSuccesses = rows.filter((r) => r.workflow.executed && r.workflow.status === 'success').length;
    const executionFailures = rows.filter((r) => r.workflow.executed && r.workflow.status !== 'success').length;
    const latencies = rows.map((r) => r.totalLatencyMs);

    const decisionAccuracyPct = round(decisionAcc.reduce((a, b) => a + b, 0) / (decisionAcc.length || 1));
    const fullMatchRatePct = round((fullMatches / (rows.length || 1)) * 100);
    const executionEligibilityPct = round((executionEligible / (rows.length || 1)) * 100);
    const workflowSuccessRatePct = round((executionSuccesses / (executed || 1)) * 100);

    const latencyScore = clamp(100 - percentile(latencies, 95) / 35, 0, 100);
    const overallScore = round(
      decisionAccuracyPct * 0.45
      + fullMatchRatePct * 0.15
      + workflowSuccessRatePct * 0.3
      + executionEligibilityPct * 0.05
      + latencyScore * 0.05,
    );

    summaries.push({
      model,
      overallScore,
      decisionAccuracyPct,
      fullMatchRatePct,
      executionEligibilityPct,
      workflowSuccessRatePct,
      executedScenarios: executed,
      successfulExecutions: executionSuccesses,
      failedExecutions: executionFailures,
      avgTotalLatencyMs: round(latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1)),
      p95TotalLatencyMs: round(percentile(latencies, 95)),
      totalEvaluations: rows.length,
      expectedEvaluations: scenariosPerModel,
    });
  }

  return summaries.sort((a, b) => {
    if (b.overallScore !== a.overallScore) return b.overallScore - a.overallScore;
    if (b.decisionAccuracyPct !== a.decisionAccuracyPct) return b.decisionAccuracyPct - a.decisionAccuracyPct;
    return a.avgTotalLatencyMs - b.avgTotalLatencyMs;
  });
}

function markdownReport(report) {
  const lines = [];
  lines.push('# x402Bench LLM Readiness Benchmark');
  lines.push('');
  lines.push(`- Run ID: ${report.meta.runId}`);
  lines.push(`- Started: ${report.meta.startedAt}`);
  lines.push(`- Finished: ${report.meta.finishedAt}`);
  lines.push(`- Models: ${report.meta.models.join(', ')}`);
  lines.push(`- Scenarios: ${report.meta.scenarioCount}`);
  lines.push(`- Runs per scenario: ${report.meta.runsPerScenario}`);
  lines.push('');
  lines.push('## What this benchmark measures');
  lines.push('');
  lines.push('A single readiness score for each model based on decision correctness plus real workflow execution reliability.');
  lines.push('');
  lines.push('## Leaderboard');
  lines.push('');
  lines.push('| Model | Overall | Decision Accuracy % | Full Match % | Workflow Success % | Execution Eligibility % | Avg Latency ms | P95 Latency ms |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const row of report.summary.models) {
    lines.push(`| ${row.model} | ${row.overallScore} | ${row.decisionAccuracyPct} | ${row.fullMatchRatePct} | ${row.workflowSuccessRatePct} | ${row.executionEligibilityPct} | ${row.avgTotalLatencyMs} | ${row.p95TotalLatencyMs} |`);
  }
  lines.push('');
  lines.push('## Scenario Evidence');
  lines.push('');
  for (const row of report.results) {
    lines.push(`### ${row.scenarioName} (${row.model}, attempt ${row.attempt})`);
    lines.push(`- Decision parse: ${row.llm.parseOk ? 'ok' : 'failed'}`);
    lines.push(`- Expected: decision=${row.expected.allow ? 'allow' : 'block'}, approvalRequired=${row.expected.approvalRequired}, priority=${row.expected.priority}`);
    lines.push(`- Model: decision=${row.llm.decision}, approvalRequired=${row.llm.approvalRequired}, priority=${row.llm.priority}`);
    lines.push(`- Decision accuracy: ${row.evaluation.accuracyPct}%`);
    lines.push(`- Workflow executed: ${row.workflow.executed ? 'yes' : 'no'}`);
    lines.push(`- Workflow status: ${row.workflow.status}`);
    lines.push(`- Total latency: ${row.totalLatencyMs} ms`);
    if (row.workflow.notes.length) {
      lines.push(`- Notes: ${row.workflow.notes.join(' | ')}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function applyLocalIntegrationDefaults(config, integrationBaseUrl) {
  if (!integrationBaseUrl) return;

  if (!config.integrations) config.integrations = {};
  if (!config.integrations.chainlink) config.integrations.chainlink = {};
  if (!config.integrations.ledger) config.integrations.ledger = {};
  if (!config.integrations.serviceProbe) config.integrations.serviceProbe = {};

  if (!config.integrations.chainlink.webhookUrl) {
    config.integrations.chainlink.webhookUrl = `${integrationBaseUrl}/api/v1/integrations/chainlink/webhook`;
  }
  if (!config.integrations.ledger.approverUrl) {
    config.integrations.ledger.approverUrl = `${integrationBaseUrl}/api/v1/integrations/ledger/approver`;
  }
  if (!config.integrations.serviceProbe.url) {
    config.integrations.serviceProbe.url = `${integrationBaseUrl}/api/v1/integrations/service-probe`;
  }
}

function normalizeModelList(modelsArg) {
  return modelsArg
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function main() {
  const options = parseArgs(process.argv);
  const cwd = process.cwd();

  const configPath = path.resolve(cwd, options.config);
  const outDir = path.resolve(cwd, options.outdir);

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const models = normalizeModelList(options.models);
  if (models.length < 2) {
    throw new Error('Provide at least two models (comma-separated) for comparative readiness benchmarking.');
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!Array.isArray(config.scenarios) || config.scenarios.length === 0) {
    throw new Error('Config must define a non-empty scenarios list.');
  }

  applyLocalIntegrationDefaults(config, options.integrationBaseUrl);

  const logger = new Logger(process.env.X402BENCH_LOG_LEVEL || 'warn');
  const runner = new BenchmarkRunner(config, logger);

  fs.mkdirSync(outDir, { recursive: true });

  const startedAt = new Date();
  const runSeed = crypto.randomBytes(4).toString('hex');
  const runId = `x402-readiness-${startedAt.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${runSeed}`;

  const results = [];
  const scenarioCount = config.scenarios.length;
  const expectedEvaluationsPerModel = scenarioCount * options.runsPerScenario;

  for (const model of models) {
    for (const scenario of config.scenarios) {
      const expected = expectedDecision(config.policy || {}, scenario);

      for (let attempt = 1; attempt <= options.runsPerScenario; attempt += 1) {
        const prompt = buildPrompt({ scenario, expected });
        const decisionStarted = performance.now();

        let llmOutput = '';
        let llmLatencyMs = 0;
        let doneReason = null;
        let llmError = null;

        try {
          const response = await callModel({
            api: options.api,
            model,
            prompt,
            maxTokens: options.maxTokens,
            temperature: options.temperature,
          });
          llmOutput = response.output;
          llmLatencyMs = response.latencyMs;
          doneReason = response.doneReason;
        } catch (error) {
          llmLatencyMs = round(performance.now() - decisionStarted);
          llmError = error instanceof Error ? error.message : String(error);
        }

        const parsed = llmError
          ? {
              parseOk: false,
              decision: 'unknown',
              approvalRequired: null,
              priority: 'unknown',
              reason: llmError,
            }
          : parseModelDecision(llmOutput);

        const evalResult = evaluateDecision(expected, parsed);

        let workflow = {
          executed: false,
          status: 'skipped',
          retryCount: 0,
          txHash: null,
          workflowId: null,
          durationMs: 0,
          notes: [],
        };

        if (evalResult.executionEligible) {
          const workflowRun = await runner.runScenario({
            runId: `${runId}-${model.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`,
            scenario,
          });

          workflow = {
            executed: true,
            status: workflowRun.status,
            retryCount: workflowRun.retryCount || 0,
            txHash: workflowRun.txHash || null,
            workflowId: workflowRun.workflowId || null,
            durationMs: workflowRun.durationMs?.total || 0,
            notes: workflowRun.notes || [],
          };
        } else {
          const notes = [];
          if (!parsed.parseOk) notes.push('Model output is not parseable as strict JSON decision.');
          if (!evalResult.decisionMatch) notes.push('Decision mismatch versus policy expectation.');
          if (!evalResult.approvalMatch) notes.push('approvalRequired mismatch versus policy expectation.');
          if (!evalResult.priorityMatch) notes.push('Priority mismatch versus requested workflow priority.');
          workflow.notes = notes;
          workflow.status = expected.allow ? 'not_executed_due_to_decision_mismatch' : 'blocked_by_policy_expectation';
        }

        const totalLatencyMs = round(llmLatencyMs + Number(workflow.durationMs || 0));

        results.push({
          model,
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          attempt,
          expected,
          llm: {
            parseOk: parsed.parseOk,
            decision: parsed.decision,
            approvalRequired: parsed.approvalRequired,
            priority: parsed.priority,
            reason: parsed.reason,
            latencyMs: llmLatencyMs,
            rawOutput: llmOutput,
            doneReason,
            error: llmError,
          },
          evaluation: evalResult,
          workflow,
          totalLatencyMs,
        });
      }
    }
  }

  const summaryRows = modelSummaryRows(results, expectedEvaluationsPerModel);

  const report = {
    meta: {
      runId,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      suiteName: 'x402Bench LLM Readiness Benchmark',
      models,
      scenarioCount,
      runsPerScenario: options.runsPerScenario,
      api: options.api,
      configPath,
      integrationBaseUrl: options.integrationBaseUrl || null,
    },
    definition: {
      name: 'LLM readiness for payment workflows',
      whatIsBenchmarked:
        'How correctly a model makes policy + workflow routing decisions, and whether those decisions lead to successful real workflow execution.',
      mocked: false,
      sponsors: ['Hedera', 'Chainlink', 'Ledger'],
    },
    summary: {
      models: summaryRows,
      totalEvaluations: results.length,
    },
    results,
  };

  const jsonPath = path.join(outDir, `${runId}.json`);
  const mdPath = path.join(outDir, `${runId}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, markdownReport(report));

  process.stdout.write(`${JSON.stringify({ runId, jsonPath, mdPath }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.exitCode = 1;
});
