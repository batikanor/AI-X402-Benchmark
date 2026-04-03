function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function scoreBenchmark(summary) {
  const reliabilityScore = clamp(summary.reliability * 100, 0, 100);

  const p95Total = summary.latencyMs.p95.total || 0;
  const latencyScore = clamp(100 - p95Total / 30, 0, 100);

  const safetyPenalty = (summary.blockedByPolicy * 4) + (summary.failed * 8);
  const safetyScore = clamp(100 - safetyPenalty, 0, 100);

  const retryPenalty = summary.retries * 2;
  const resilienceScore = clamp(100 - retryPenalty - (summary.failureRate * 50), 0, 100);

  const weighted = (reliabilityScore * 0.4)
    + (latencyScore * 0.2)
    + (safetyScore * 0.25)
    + (resilienceScore * 0.15);

  return {
    reliabilityScore: Number(reliabilityScore.toFixed(2)),
    latencyScore: Number(latencyScore.toFixed(2)),
    safetyScore: Number(safetyScore.toFixed(2)),
    resilienceScore: Number(resilienceScore.toFixed(2)),
    overallScore: Number(weighted.toFixed(2))
  };
}

export function classifyGrade(overallScore) {
  if (overallScore >= 85) return "A";
  if (overallScore >= 75) return "B";
  if (overallScore >= 65) return "C";
  if (overallScore >= 50) return "D";
  return "F";
}
