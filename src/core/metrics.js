export function computePercentile(values, percentile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

export function summarizeRun(scenarioResults) {
  const stageDurations = {
    ledger: [],
    chainlink: [],
    hedera: [],
    serviceProbe: [],
    total: []
  };

  let successful = 0;
  let failed = 0;
  let retries = 0;
  let blockedByPolicy = 0;

  for (const result of scenarioResults) {
    if (result.status === "success") successful += 1;
    if (result.status === "failed") failed += 1;
    if (result.status === "blocked") blockedByPolicy += 1;

    retries += result.retryCount || 0;

    for (const stage of Object.keys(stageDurations)) {
      if (typeof result.durationMs?.[stage] === "number") {
        stageDurations[stage].push(result.durationMs[stage]);
      }
    }
  }

  const total = scenarioResults.length || 1;
  const reliability = successful / total;
  const failureRate = failed / total;

  return {
    totalScenarios: scenarioResults.length,
    successful,
    failed,
    blockedByPolicy,
    retries,
    reliability,
    failureRate,
    latencyMs: {
      p50: {
        ledger: computePercentile(stageDurations.ledger, 50),
        chainlink: computePercentile(stageDurations.chainlink, 50),
        hedera: computePercentile(stageDurations.hedera, 50),
        serviceProbe: computePercentile(stageDurations.serviceProbe, 50),
        total: computePercentile(stageDurations.total, 50)
      },
      p95: {
        ledger: computePercentile(stageDurations.ledger, 95),
        chainlink: computePercentile(stageDurations.chainlink, 95),
        hedera: computePercentile(stageDurations.hedera, 95),
        serviceProbe: computePercentile(stageDurations.serviceProbe, 95),
        total: computePercentile(stageDurations.total, 95)
      }
    }
  };
}
