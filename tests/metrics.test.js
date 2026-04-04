import test from "node:test";
import assert from "node:assert/strict";
import { computePercentile, summarizeRun } from "../src/core/metrics.js";

test("computePercentile returns p95 correctly", () => {
  const values = [10, 20, 30, 40, 50];
  assert.equal(computePercentile(values, 95), 50);
});

test("summarizeRun computes reliability and retries", () => {
  const summary = summarizeRun([
    {
      status: "success",
      retryCount: 1,
      durationMs: { ledger: 1, chainlink: 2, hedera: 3, serviceProbe: 4, total: 10 }
    },
    {
      status: "failed",
      retryCount: 2,
      durationMs: { ledger: 1, chainlink: 2, hedera: 3, serviceProbe: 4, total: 11 }
    },
    {
      status: "blocked",
      retryCount: 0,
      durationMs: { ledger: 1, chainlink: 0, hedera: 0, serviceProbe: 0, total: 3 }
    }
  ]);

  assert.equal(summary.totalScenarios, 3);
  assert.equal(summary.successful, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.blockedByPolicy, 1);
  assert.equal(summary.retries, 3);
  assert.equal(Number(summary.reliability.toFixed(4)), 0.3333);
  assert.equal(Number(summary.failureRate.toFixed(4)), 0.3333);
});
