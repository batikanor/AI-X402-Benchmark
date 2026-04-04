#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function parseArgs(argv) {
  const options = {
    suite: 'llm_bench/suite.json',
    models: 'gemma4:e4b',
    outdir: 'reports',
    runsPerTask: 1,
    api: 'http://127.0.0.1:11434/api/generate',
    maxTokens: 1024,
    temperature: 0.1,
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
      case '--suite':
        if (!value) throw new Error('--suite requires a value');
        options.suite = value;
        break;
      case '--models':
        if (!value) throw new Error('--models requires a value');
        options.models = value;
        break;
      case '--outdir':
        if (!value) throw new Error('--outdir requires a value');
        options.outdir = value;
        break;
      case '--runs-per-task':
        if (!value) throw new Error('--runs-per-task requires a value');
        options.runsPerTask = Number(value);
        break;
      case '--api':
        if (!value) throw new Error('--api requires a value');
        options.api = value;
        break;
      case '--max-tokens':
        if (!value) throw new Error('--max-tokens requires a value');
        options.maxTokens = Number(value);
        break;
      case '--temperature':
        if (!value) throw new Error('--temperature requires a value');
        options.temperature = Number(value);
        break;
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }

  if (!Number.isInteger(options.runsPerTask) || options.runsPerTask <= 0 || options.runsPerTask > 10) {
    throw new Error('runsPerTask must be an integer between 1 and 10.');
  }

  return options;
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

function round(value, digits = 2) {
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

function normalizeForMatch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function scoreOutput(task, output) {
  const keywords = Array.isArray(task.expectedKeywords) ? task.expectedKeywords : [];
  const normalizedOutput = normalizeForMatch(output);
  if (keywords.length === 0) {
    return { matched: [], coverage: 1 };
  }
  const matched = keywords.filter((keyword) => normalizedOutput.includes(normalizeForMatch(keyword)));
  return {
    matched,
    coverage: matched.length / keywords.length,
  };
}

async function callModel(api, model, prompt, maxTokens, temperature) {
  const started = performance.now();
  const response = await fetch(api, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

  const elapsedMs = performance.now() - started;
  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Ollama error ${response.status}: ${bodyText}`);
  }

  const payload = await response.json();
  return {
    text: String(payload.response || ''),
    latencyMs: elapsedMs,
    doneReason: payload.done_reason ?? null,
    promptEvalCount: payload.prompt_eval_count ?? null,
    evalCount: payload.eval_count ?? null,
  };
}

function buildMarkdown(result) {
  const lines = [];
  lines.push(`# ${result.meta.suiteName} - LLM Benchmark`);
  lines.push('');
  lines.push(`- Run ID: ${result.meta.runId}`);
  lines.push(`- Started: ${result.meta.startedAt}`);
  lines.push(`- Finished: ${result.meta.finishedAt}`);
  lines.push(`- Models: ${result.meta.models.join(', ')}`);
  lines.push(`- Tasks: ${result.meta.taskCount}`);
  lines.push('');
  lines.push('## Model summary');
  lines.push('');
  lines.push('| Model | Avg latency ms | P95 latency ms | Avg keyword coverage % | Success rate % |');
  lines.push('| --- | ---: | ---: | ---: | ---: |');
  for (const row of result.summary.models) {
    lines.push(`| ${row.model} | ${row.avgLatencyMs} | ${row.p95LatencyMs} | ${row.avgCoveragePct} | ${row.successRatePct} |`);
  }
  lines.push('');
  lines.push('## Task-level outputs');
  lines.push('');
  for (const row of result.results) {
    lines.push(`### ${row.taskId} (${row.model})`);
    lines.push(`- Coverage: ${row.coveragePct}%`);
    lines.push(`- Latency: ${row.latencyMs} ms`);
    lines.push(`- Matched keywords: ${row.matchedKeywords.join(', ') || 'none'}`);
    lines.push('');
    lines.push('```text');
    lines.push(row.output.slice(0, 800));
    lines.push('```');
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const options = parseArgs(process.argv);
  const cwd = process.cwd();
  const suitePath = path.resolve(cwd, options.suite);
  const outDir = path.resolve(cwd, options.outdir);

  if (!fs.existsSync(suitePath)) {
    throw new Error(`Suite file not found: ${suitePath}`);
  }

  const suite = JSON.parse(fs.readFileSync(suitePath, 'utf8'));
  if (!suite || !Array.isArray(suite.tasks) || suite.tasks.length === 0) {
    throw new Error('Suite must contain a non-empty tasks array.');
  }

  const models = options.models
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (models.length === 0) {
    throw new Error('At least one model must be provided.');
  }

  fs.mkdirSync(outDir, { recursive: true });

  const startedAt = new Date();
  const runSeed = crypto.randomBytes(4).toString('hex');
  const runId = `llm-bench-${startedAt.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${runSeed}`;

  const rawResults = [];

  for (const model of models) {
    for (const task of suite.tasks) {
      for (let attempt = 0; attempt < options.runsPerTask; attempt += 1) {
        const prompt = `${task.prompt}\n\nRespond in plain text using the exact labels requested, one line per label.`;
        let output = '';
        let latencyMs = 0;
        let ok = false;
        let error = null;
        let doneReason = null;

        try {
          const response = await callModel(options.api, model, prompt, options.maxTokens, options.temperature);
          output = response.text;
          latencyMs = response.latencyMs;
          doneReason = response.doneReason;
          ok = output.trim().length > 0;
          if (!ok) {
            error = `empty response (done_reason=${doneReason ?? 'unknown'})`;
          }
        } catch (err) {
          output = '';
          latencyMs = 0;
          ok = false;
          error = err instanceof Error ? err.message : String(err);
        }

        const scored = scoreOutput(task, output);
        rawResults.push({
          model,
          taskId: task.id,
          taskName: task.name,
          attempt: attempt + 1,
          ok,
          error,
          doneReason,
          latencyMs: round(latencyMs),
          output,
          matchedKeywords: scored.matched,
          coveragePct: round(scored.coverage * 100, 2),
        });
      }
    }
  }

  const summaryRows = models.map((model) => {
    const rows = rawResults.filter((item) => item.model === model);
    const successRows = rows.filter((item) => item.ok);
    const latencies = successRows.map((item) => item.latencyMs);
    const coverages = successRows.map((item) => item.coveragePct);

    const avgLatency = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    const avgCoverage = coverages.length ? coverages.reduce((a, b) => a + b, 0) / coverages.length : 0;

    return {
      model,
      avgLatencyMs: round(avgLatency),
      p95LatencyMs: round(percentile(latencies, 95)),
      avgCoveragePct: round(avgCoverage),
      successRatePct: round((rows.length ? successRows.length / rows.length : 0) * 100),
    };
  });

  const result = {
    meta: {
      runId,
      suiteName: suite.name || 'llm-benchmark-suite',
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      models,
      taskCount: suite.tasks.length,
      runsPerTask: options.runsPerTask,
      api: options.api,
    },
    summary: {
      models: summaryRows,
    },
    results: rawResults,
  };

  const jsonPath = path.join(outDir, `${runId}.json`);
  const mdPath = path.join(outDir, `${runId}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  fs.writeFileSync(mdPath, buildMarkdown(result));

  process.stdout.write(`${JSON.stringify({ runId, jsonPath, mdPath }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.exitCode = 1;
});
