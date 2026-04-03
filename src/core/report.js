import { classifyGrade } from "./scoring.js";

function fmtMs(ms) {
  return `${Number(ms || 0).toFixed(2)} ms`;
}

export function buildMarkdownReport(runResult) {
  const { metadata, summary, scoring, scenarios } = runResult;
  const grade = classifyGrade(scoring.overallScore);

  const scenarioRows = scenarios
    .map((s) => `| ${s.id} | ${s.status} | ${fmtMs(s.durationMs.total)} | ${s.retryCount || 0} | ${s.txHash || "-"} | ${s.workflowId || "-"} |`)
    .join("\n");

  return `# x402Bench Report\n\n`
    + `- Suite: ${metadata.suite}\n`
    + `- Run ID: ${metadata.runId}\n`
    + `- Started: ${metadata.startedAt}\n`
    + `- Finished: ${metadata.finishedAt}\n`
    + `- Grade: ${grade}\n\n`
    + `## Scorecard\n\n`
    + `| Dimension | Score |\n|---|---:|\n`
    + `| Reliability | ${scoring.reliabilityScore} |\n`
    + `| Latency | ${scoring.latencyScore} |\n`
    + `| Safety | ${scoring.safetyScore} |\n`
    + `| Resilience | ${scoring.resilienceScore} |\n`
    + `| **Overall** | **${scoring.overallScore}** |\n\n`
    + `## Aggregate Metrics\n\n`
    + `- Total scenarios: ${summary.totalScenarios}\n`
    + `- Successful: ${summary.successful}\n`
    + `- Failed: ${summary.failed}\n`
    + `- Blocked by policy: ${summary.blockedByPolicy}\n`
    + `- Total retries: ${summary.retries}\n`
    + `- Reliability: ${(summary.reliability * 100).toFixed(2)}%\n`
    + `- Failure rate: ${(summary.failureRate * 100).toFixed(2)}%\n\n`
    + `## Latency\n\n`
    + `- p50 total: ${fmtMs(summary.latencyMs.p50.total)}\n`
    + `- p95 total: ${fmtMs(summary.latencyMs.p95.total)}\n`
    + `- p95 chainlink: ${fmtMs(summary.latencyMs.p95.chainlink)}\n`
    + `- p95 hedera: ${fmtMs(summary.latencyMs.p95.hedera)}\n\n`
    + `## Scenario Results\n\n`
    + `| Scenario | Status | Total Duration | Retries | Hedera Tx | Chainlink Workflow |\n`
    + `|---|---|---:|---:|---|---|\n`
    + `${scenarioRows}\n`;
}
