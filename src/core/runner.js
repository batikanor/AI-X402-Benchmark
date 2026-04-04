import crypto from "node:crypto";
import { durationMs, nowIso, msToFixed } from "../utils/time.js";
import { HederaAdapter } from "../adapters/hederaAdapter.js";
import { ChainlinkCreAdapter } from "../adapters/chainlinkCreAdapter.js";
import { LedgerPolicyAdapter } from "../adapters/ledgerPolicyAdapter.js";
import { ServiceProbe } from "../adapters/serviceProbe.js";
import { summarizeRun } from "./metrics.js";
import { scoreBenchmark } from "./scoring.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn, retryCount, retryDelayMs, logger, contextLabel) {
  let attempt = 0;
  // first attempt + retryCount retries
  while (attempt <= retryCount) {
    try {
      const value = await fn();
      return { value, retriesUsed: attempt };
    } catch (error) {
      if (attempt >= retryCount) throw error;
      logger.warn(`${contextLabel} failed; retrying`, {
        attempt: attempt + 1,
        retryCount,
        error: String(error.message || error)
      });
      attempt += 1;
      await sleep(retryDelayMs);
    }
  }

  throw new Error(`${contextLabel} failed unexpectedly`);
}

export class BenchmarkRunner {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;

    this.hedera = new HederaAdapter(config.integrations.hedera, logger);
    this.chainlink = new ChainlinkCreAdapter(config.integrations.chainlink, logger);
    this.ledger = new LedgerPolicyAdapter(config.integrations.ledger, config.policy, logger);
    this.serviceProbe = new ServiceProbe(config.integrations.serviceProbe || {}, logger);
  }

  async runSuite() {
    const startedAt = nowIso();
    const runId = `${this.config.suite.id}-${crypto.randomUUID().slice(0, 8)}`;

    this.logger.info("x402Bench run started", {
      suite: this.config.suite.id,
      runId,
      scenarioCount: this.config.scenarios.length
    });

    const scenarioResults = [];

    for (const scenario of this.config.scenarios) {
      const result = await this.runScenario({ runId, scenario });
      scenarioResults.push(result);
    }

    const summary = summarizeRun(scenarioResults);
    const scoring = scoreBenchmark(summary);
    const finishedAt = nowIso();

    return {
      metadata: {
        suite: this.config.suite.id,
        runId,
        startedAt,
        finishedAt
      },
      summary,
      scoring,
      scenarios: scenarioResults
    };
  }

  async runScenario({ runId, scenario }) {
    this.logger.info("Scenario started", {
      runId,
      scenarioId: scenario.id,
      name: scenario.name
    });

    const scenarioStart = process.hrtime.bigint();
    const durations = {
      ledger: 0,
      chainlink: 0,
      hedera: 0,
      serviceProbe: 0,
      total: 0
    };

    let status = "failed";
    let retryCount = 0;
    let txHash = null;
    let workflowId = null;
    const notes = [];

    try {
      const ledgerStart = process.hrtime.bigint();
      const policyDecision = this.ledger.evaluatePolicy({
        amountUsd: scenario.payment.amountUsd,
        destinationCountry: scenario.payment.destinationCountry
      });

      if (!policyDecision.allowed) {
        durations.ledger = msToFixed(durationMs(ledgerStart, process.hrtime.bigint()));
        durations.total = msToFixed(durationMs(scenarioStart, process.hrtime.bigint()));
        return {
          id: scenario.id,
          name: scenario.name,
          status: "blocked",
          retryCount: 0,
          txHash: null,
          workflowId: null,
          durationMs: durations,
          notes: [policyDecision.reason]
        };
      }

      if (policyDecision.approvalRequired) {
        const approval = await this.ledger.requestApproval({
          scenarioId: scenario.id,
          runId,
          amountUsd: scenario.payment.amountUsd
        });

        if (!approval.approved) {
          durations.ledger = msToFixed(durationMs(ledgerStart, process.hrtime.bigint()));
          durations.total = msToFixed(durationMs(scenarioStart, process.hrtime.bigint()));
          return {
            id: scenario.id,
            name: scenario.name,
            status: "blocked",
            retryCount: 0,
            txHash: null,
            workflowId: null,
            durationMs: durations,
            notes: ["Ledger approval rejected"]
          };
        }

        notes.push(`Approval ref: ${approval.approverRef || "n/a"}`);
      }
      durations.ledger = msToFixed(durationMs(ledgerStart, process.hrtime.bigint()));

      const retryPolicy = scenario.retryPolicy || this.config.defaultRetryPolicy || { retries: 1, delayMs: 1000 };

      const chainlinkStart = process.hrtime.bigint();
      const chainlinkExec = await withRetry(
        () => this.chainlink.runWorkflow({
          scenarioId: scenario.id,
          runId,
          workflowInput: scenario.workflowInput || {}
        }),
        retryPolicy.retries,
        retryPolicy.delayMs,
        this.logger,
        `chainlink:${scenario.id}`
      );
      retryCount += chainlinkExec.retriesUsed;
      workflowId = chainlinkExec.value.workflowId;
      durations.chainlink = msToFixed(durationMs(chainlinkStart, process.hrtime.bigint()));

      const hederaStart = process.hrtime.bigint();
      const hederaExec = await withRetry(
        () => this.hedera.executePayment({
          scenarioId: scenario.id,
          runId,
          payment: scenario.payment
        }),
        retryPolicy.retries,
        retryPolicy.delayMs,
        this.logger,
        `hedera:${scenario.id}`
      );
      retryCount += hederaExec.retriesUsed;
      txHash = hederaExec.value.txHash;
      durations.hedera = msToFixed(durationMs(hederaStart, process.hrtime.bigint()));

      const probeStart = process.hrtime.bigint();
      const probeExec = await withRetry(
        () => this.serviceProbe.probe({
          runId,
          scenarioId: scenario.id,
          txHash,
          workflowId
        }),
        retryPolicy.retries,
        retryPolicy.delayMs,
        this.logger,
        `serviceProbe:${scenario.id}`
      );
      retryCount += probeExec.retriesUsed;
      durations.serviceProbe = msToFixed(durationMs(probeStart, process.hrtime.bigint()));

      if (probeExec.value.status === "failed") {
        notes.push(`Service probe failed with code ${probeExec.value.code}`);
        status = "failed";
      } else {
        status = "success";
      }
    } catch (error) {
      status = "failed";
      notes.push(String(error.message || error));
    }

    durations.total = msToFixed(durationMs(scenarioStart, process.hrtime.bigint()));

    this.logger.info("Scenario finished", {
      runId,
      scenarioId: scenario.id,
      status,
      txHash,
      workflowId,
      durationMs: durations.total
    });

    return {
      id: scenario.id,
      name: scenario.name,
      status,
      retryCount,
      txHash,
      workflowId,
      durationMs: durations,
      notes
    };
  }
}
