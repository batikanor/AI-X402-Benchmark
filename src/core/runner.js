import crypto from "node:crypto";
import { durationMs, nowIso, msToFixed } from "../utils/time.js";
import { HederaAdapter } from "../adapters/hederaAdapter.js";
import { ChainlinkCreAdapter } from "../adapters/chainlinkCreAdapter.js";
import { LedgerPolicyAdapter } from "../adapters/ledgerPolicyAdapter.js";
import { ServiceProbe } from "../adapters/serviceProbe.js";
import { getEnv } from "../utils/env.js";
import { summarizeRun } from "./metrics.js";
import { scoreBenchmark } from "./scoring.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundHbar(value) {
  return Math.round(value * 1e8) / 1e8;
}

function resolveSettlementPayment(payment) {
  const baseAmount = parsePositiveNumber(payment?.amountHbar) ?? 1;
  const overrideRaw = String(getEnv("X402BENCH_SETTLEMENT_HBAR_OVERRIDE", "") || "").trim();
  const multiplier = parsePositiveNumber(getEnv("X402BENCH_SETTLEMENT_HBAR_MULTIPLIER", "1")) ?? 1;
  const minAmount = parsePositiveNumber(getEnv("X402BENCH_SETTLEMENT_HBAR_MIN", "0.0001")) ?? 0.0001;
  const maxAmount = parsePositiveNumber(getEnv("X402BENCH_SETTLEMENT_HBAR_MAX", "")) ?? Number.POSITIVE_INFINITY;

  const overrideAmount = overrideRaw ? parsePositiveNumber(overrideRaw) : null;
  const rawEffective = overrideAmount ?? (baseAmount * multiplier);
  const effectiveAmount = roundHbar(clamp(rawEffective, minAmount, maxAmount));

  return {
    payment: {
      ...payment,
      amountHbar: effectiveAmount,
    },
    baseAmount,
    effectiveAmount,
    mode: overrideAmount
      ? "override"
      : (multiplier !== 1 ? "multiplier" : "base"),
  };
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
    const trace = [
      {
        id: "ledger_policy",
        label: "Ledger policy pre-check",
        attempted: false,
        status: "skipped",
        durationMs: 0,
        retriesUsed: 0,
        mode: "local_policy",
        endpoint: "local-policy-engine",
        detail: "Not evaluated yet."
      },
      {
        id: "ledger_approval",
        label: "Ledger approval check",
        attempted: false,
        status: "skipped",
        durationMs: 0,
        retriesUsed: 0,
        mode: null,
        endpoint: null,
        detail: "Not evaluated yet."
      },
      {
        id: "chainlink_workflow",
        label: "Chainlink workflow orchestration",
        attempted: false,
        status: "skipped",
        durationMs: 0,
        retriesUsed: 0,
        mode: null,
        endpoint: null,
        detail: "Not executed yet."
      },
      {
        id: "hedera_settlement",
        label: "Hedera settlement",
        attempted: false,
        status: "skipped",
        durationMs: 0,
        retriesUsed: 0,
        mode: null,
        endpoint: null,
        detail: "Not executed yet."
      },
      {
        id: "service_probe",
        label: "Service probe",
        attempted: false,
        status: "skipped",
        durationMs: 0,
        retriesUsed: 0,
        mode: "http_probe",
        endpoint: null,
        detail: "Not executed yet."
      }
    ];
    const setTrace = (id, patch) => {
      const entry = trace.find((item) => item.id === id);
      if (entry) Object.assign(entry, patch);
    };

    try {
      const ledgerStart = process.hrtime.bigint();
      const policyStart = process.hrtime.bigint();
      const policyDecision = this.ledger.evaluatePolicy({
        amountUsd: scenario.payment.amountUsd,
        destinationCountry: scenario.payment.destinationCountry
      });
      const policyDurationMs = msToFixed(durationMs(policyStart, process.hrtime.bigint()));
      setTrace("ledger_policy", {
        attempted: true,
        status: policyDecision.allowed ? "passed" : "blocked",
        durationMs: policyDurationMs,
        detail: policyDecision.reason
      });

      if (!policyDecision.allowed) {
        durations.ledger = msToFixed(durationMs(ledgerStart, process.hrtime.bigint()));
        durations.total = msToFixed(durationMs(scenarioStart, process.hrtime.bigint()));
        setTrace("ledger_approval", {
          attempted: false,
          status: "skipped",
          detail: "Skipped because policy decision blocked execution."
        });
        setTrace("chainlink_workflow", {
          attempted: false,
          status: "skipped",
          detail: "Skipped because policy decision blocked execution."
        });
        setTrace("hedera_settlement", {
          attempted: false,
          status: "skipped",
          detail: "Skipped because policy decision blocked execution."
        });
        setTrace("service_probe", {
          attempted: false,
          status: "skipped",
          detail: "Skipped because policy decision blocked execution."
        });
        return {
          id: scenario.id,
          name: scenario.name,
          status: "blocked",
          retryCount: 0,
          txHash: null,
          workflowId: null,
          durationMs: durations,
          notes: [policyDecision.reason],
          trace
        };
      }

      if (policyDecision.approvalRequired) {
        const approvalStart = process.hrtime.bigint();
        const approval = await this.ledger.requestApproval({
          scenarioId: scenario.id,
          runId,
          amountUsd: scenario.payment.amountUsd
        });
        const approvalDurationMs = msToFixed(durationMs(approvalStart, process.hrtime.bigint()));
        setTrace("ledger_approval", {
          attempted: true,
          status: approval.approved ? "approved" : "rejected",
          durationMs: approvalDurationMs,
          mode: approval.mode || null,
          endpoint: approval.endpoint || null,
          detail: approval.approved
            ? `Approved by ${approval.approverRef || "unknown approver"}`
            : "Ledger approval rejected by approver."
        });

        if (!approval.approved) {
          durations.ledger = msToFixed(durationMs(ledgerStart, process.hrtime.bigint()));
          durations.total = msToFixed(durationMs(scenarioStart, process.hrtime.bigint()));
          setTrace("chainlink_workflow", {
            attempted: false,
            status: "skipped",
            detail: "Skipped because ledger approval was rejected."
          });
          setTrace("hedera_settlement", {
            attempted: false,
            status: "skipped",
            detail: "Skipped because ledger approval was rejected."
          });
          setTrace("service_probe", {
            attempted: false,
            status: "skipped",
            detail: "Skipped because ledger approval was rejected."
          });
          return {
            id: scenario.id,
            name: scenario.name,
            status: "blocked",
            retryCount: 0,
            txHash: null,
            workflowId: null,
            durationMs: durations,
            notes: ["Ledger approval rejected"],
            trace
          };
        }

        notes.push(`Approval ref: ${approval.approverRef || "n/a"}`);
      } else {
        setTrace("ledger_approval", {
          attempted: false,
          status: "not_required",
          detail: "Approval not required for this payment amount/risk profile."
        });
      }
      durations.ledger = msToFixed(durationMs(ledgerStart, process.hrtime.bigint()));

      const retryPolicy = scenario.retryPolicy || this.config.defaultRetryPolicy || { retries: 1, delayMs: 1000 };

      const chainlinkStart = process.hrtime.bigint();
      setTrace("chainlink_workflow", {
        attempted: true,
        status: "running",
        detail: "Chainlink workflow call started."
      });
      let chainlinkExec;
      try {
        chainlinkExec = await withRetry(
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
      } catch (error) {
        const duration = msToFixed(durationMs(chainlinkStart, process.hrtime.bigint()));
        setTrace("chainlink_workflow", {
          attempted: true,
          status: "failed",
          durationMs: duration,
          retriesUsed: retryPolicy.retries,
          detail: String(error.message || error)
        });
        throw error;
      }
      retryCount += chainlinkExec.retriesUsed;
      workflowId = chainlinkExec.value.workflowId;
      durations.chainlink = msToFixed(durationMs(chainlinkStart, process.hrtime.bigint()));
      setTrace("chainlink_workflow", {
        status: "success",
        durationMs: durations.chainlink,
        retriesUsed: chainlinkExec.retriesUsed,
        mode: chainlinkExec.value.mode || null,
        endpoint: chainlinkExec.value.endpoint || null,
        detail: `Workflow ${workflowId || "n/a"} (${chainlinkExec.value.status || "completed"}).`
      });

      const hederaStart = process.hrtime.bigint();
      setTrace("hedera_settlement", {
        attempted: true,
        status: "running",
        detail: "Submitting settlement to Hedera."
      });
      const effectiveSettlement = resolveSettlementPayment(scenario.payment);
      if (effectiveSettlement.effectiveAmount !== effectiveSettlement.baseAmount) {
        notes.push(
          `Settlement HBAR adjusted (${effectiveSettlement.mode}): ${effectiveSettlement.baseAmount} -> ${effectiveSettlement.effectiveAmount}`
        );
      }
      let hederaExec;
      try {
        hederaExec = await withRetry(
          () => this.hedera.executePayment({
            scenarioId: scenario.id,
            runId,
            payment: effectiveSettlement.payment
          }),
          retryPolicy.retries,
          retryPolicy.delayMs,
          this.logger,
          `hedera:${scenario.id}`
        );
      } catch (error) {
        const duration = msToFixed(durationMs(hederaStart, process.hrtime.bigint()));
        setTrace("hedera_settlement", {
          attempted: true,
          status: "failed",
          durationMs: duration,
          retriesUsed: retryPolicy.retries,
          detail: String(error.message || error)
        });
        throw error;
      }
      retryCount += hederaExec.retriesUsed;
      txHash = hederaExec.value.txHash;
      durations.hedera = msToFixed(durationMs(hederaStart, process.hrtime.bigint()));
      setTrace("hedera_settlement", {
        status: "success",
        durationMs: durations.hedera,
        retriesUsed: hederaExec.retriesUsed,
        mode: hederaExec.value.mode || null,
        endpoint: hederaExec.value.endpoint || null,
        detail: `txHash: ${txHash || "n/a"} | amountHbar: ${effectiveSettlement.payment.amountHbar}`
      });

      const probeStart = process.hrtime.bigint();
      setTrace("service_probe", {
        attempted: true,
        status: "running",
        detail: "Running post-settlement service probe."
      });
      let probeExec;
      try {
        probeExec = await withRetry(
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
      } catch (error) {
        const duration = msToFixed(durationMs(probeStart, process.hrtime.bigint()));
        setTrace("service_probe", {
          attempted: true,
          status: "failed",
          durationMs: duration,
          retriesUsed: retryPolicy.retries,
          detail: String(error.message || error)
        });
        throw error;
      }
      retryCount += probeExec.retriesUsed;
      durations.serviceProbe = msToFixed(durationMs(probeStart, process.hrtime.bigint()));

      if (probeExec.value.status === "failed") {
        notes.push(`Service probe failed with code ${probeExec.value.code}`);
        setTrace("service_probe", {
          status: "failed",
          durationMs: durations.serviceProbe,
          retriesUsed: probeExec.retriesUsed,
          endpoint: probeExec.value.endpoint || null,
          detail: `Probe failed (${probeExec.value.code || "unknown"}): ${probeExec.value.details || "no details"}`
        });
        status = "failed";
      } else {
        setTrace("service_probe", {
          status: probeExec.value.status === "skipped" ? "skipped" : "success",
          durationMs: durations.serviceProbe,
          retriesUsed: probeExec.retriesUsed,
          endpoint: probeExec.value.endpoint || null,
          detail:
            probeExec.value.status === "skipped"
              ? "No probe URL configured; probe skipped."
              : `Probe passed (${probeExec.value.code || "ok"}).`
        });
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
      notes,
      trace
    };
  }
}
