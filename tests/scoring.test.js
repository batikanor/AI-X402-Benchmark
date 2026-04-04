import test from "node:test";
import assert from "node:assert/strict";
import { scoreBenchmark, classifyGrade } from "../src/core/scoring.js";

test("scoreBenchmark returns bounded scores", () => {
  const score = scoreBenchmark({
    reliability: 0.8,
    failureRate: 0.2,
    blockedByPolicy: 1,
    failed: 1,
    retries: 2,
    latencyMs: {
      p95: { total: 600 }
    }
  });

  assert.ok(score.overallScore >= 0 && score.overallScore <= 100);
  assert.ok(score.reliabilityScore >= 0 && score.reliabilityScore <= 100);
  assert.ok(score.latencyScore >= 0 && score.latencyScore <= 100);
  assert.ok(score.safetyScore >= 0 && score.safetyScore <= 100);
});

test("classifyGrade maps expected thresholds", () => {
  assert.equal(classifyGrade(90), "A");
  assert.equal(classifyGrade(80), "B");
  assert.equal(classifyGrade(70), "C");
  assert.equal(classifyGrade(55), "D");
  assert.equal(classifyGrade(30), "F");
});
