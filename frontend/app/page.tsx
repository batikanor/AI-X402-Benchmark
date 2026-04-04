"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Gauge, RefreshCw, ShieldCheck, Timer } from "lucide-react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchDashboard, fetchLlmDashboard, runBenchmark, runLlmBenchmark } from "@/lib/api";

function metricLabel(value: number | undefined, suffix = ""): string {
  if (value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return `${value.toFixed(2)}${suffix}`;
}

function compactLog(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.length <= 5000) {
    return trimmed;
  }
  return `${trimmed.slice(0, 5000)}\n...[truncated]`;
}

function summarizeFailure(returnCode: number, stderr: string, stdout: string): string {
  const combined = `${stderr}\n${stdout}`.replace(/\s+/g, " ").trim();
  if (!combined) {
    return `Run failed (code ${returnCode}).`;
  }
  if (combined.includes("CHAINLINK_WEBHOOK_URL")) {
    return `Run failed (code ${returnCode}). Missing Chainlink webhook configuration.`;
  }
  if (combined.toLowerCase().includes("timed out")) {
    return `Run failed (code ${returnCode}). Benchmark timed out.`;
  }
  return `Run failed (code ${returnCode}): ${combined.slice(0, 180)}`;
}

function formatDateTime(value: string | undefined): string {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function modelRankScore(avgCoveragePct: number, successRatePct: number, avgLatencyMs: number): number {
  const latencyComponent = Math.max(0, 100 - avgLatencyMs / 200);
  return avgCoveragePct * 0.5 + successRatePct * 0.4 + latencyComponent * 0.1;
}

export default function HomePage() {
  const { data, error, isLoading, mutate } = useSWR("dashboard", fetchDashboard, { refreshInterval: 15000 });
  const {
    data: llmData,
    error: llmError,
    isLoading: llmLoading,
    mutate: mutateLlm,
  } = useSWR("llm-dashboard", fetchLlmDashboard, { refreshInterval: 15000 });
  const [running, setRunning] = useState(false);
  const [strict, setStrict] = useState(false);
  const [runSummary, setRunSummary] = useState<string>("");
  const [runTechnicalLog, setRunTechnicalLog] = useState<string>("");
  const [llmRunning, setLlmRunning] = useState(false);
  const [llmRunsPerTask, setLlmRunsPerTask] = useState(1);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [llmRunSummary, setLlmRunSummary] = useState<string>("");
  const [llmRunTechnicalLog, setLlmRunTechnicalLog] = useState<string>("");

  const latest = data?.latest;
  const project = data?.project;
  const benchmarkDefinition = data?.benchmarkDefinition;

  useEffect(() => {
    if (!llmData?.availableModels.length) {
      return;
    }
    setSelectedModels((previous) => {
      const available = llmData.availableModels;
      const filteredPrevious = previous.filter((model) => available.includes(model));
      if (filteredPrevious.length >= 2) {
        return filteredPrevious;
      }
      const seeded = [...llmData.recommendedModels, ...available];
      const deduped = Array.from(new Set(seeded)).slice(0, Math.min(3, available.length));
      return deduped;
    });
  }, [llmData]);

  const topScenario = useMemo(() => {
    if (!data?.scenarios.length) {
      return undefined;
    }
    return [...data.scenarios].sort((a, b) => b.durationMs - a.durationMs)[0];
  }, [data?.scenarios]);

  const llmRows = useMemo(() => {
    if (!llmData?.models.length) {
      return [];
    }
    return [...llmData.models].sort((a, b) => {
      if (b.avgCoveragePct !== a.avgCoveragePct) {
        return b.avgCoveragePct - a.avgCoveragePct;
      }
      if (b.successRatePct !== a.successRatePct) {
        return b.successRatePct - a.successRatePct;
      }
      return a.avgLatencyMs - b.avgLatencyMs;
    });
  }, [llmData?.models]);

  const llmLeader = llmRows[0];

  function toggleModelSelection(model: string) {
    setSelectedModels((previous) => {
      if (previous.includes(model)) {
        return previous.filter((item) => item !== model);
      }
      if (previous.length >= 6) {
        return previous;
      }
      return [...previous, model];
    });
  }

  async function handleRun() {
    try {
      setRunning(true);
      const result = await runBenchmark(strict);
      setRunTechnicalLog(compactLog(result.stdout || result.stderr || ""));
      const updated = await mutate();
      const latestAfterRun = updated?.latest;

      if (result.ok) {
        if (latestAfterRun) {
          setRunSummary(
            `Run completed. Score ${metricLabel(latestAfterRun.overallScore)}, success ${latestAfterRun.successful}/${latestAfterRun.totalScenarios}, p95 ${metricLabel(latestAfterRun.p95TotalMs, " ms")}, run ID ${latestAfterRun.runId}.`,
          );
        } else {
          setRunSummary("Run completed. Dashboard is refreshing with latest metrics.");
        }
      } else {
        setRunSummary(summarizeFailure(result.returnCode, result.stderr, result.stdout));
      }
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : String(runError);
      setRunSummary(`Run failed: ${message}`);
      setRunTechnicalLog(compactLog(message));
    } finally {
      setRunning(false);
    }
  }

  async function handleLlmRun() {
    if (selectedModels.length < 2) {
      setLlmRunSummary("Select at least 2 models to run a real comparison.");
      return;
    }
    try {
      setLlmRunning(true);
      const result = await runLlmBenchmark({
        models: selectedModels,
        runsPerTask: llmRunsPerTask,
        maxTokens: 768,
        temperature: 0.1,
      });
      setLlmRunTechnicalLog(compactLog(result.stdout || result.stderr || ""));
      const updated = await mutateLlm();
      const leader = updated?.models?.length
        ? [...updated.models].sort((a, b) => {
            if (b.avgCoveragePct !== a.avgCoveragePct) {
              return b.avgCoveragePct - a.avgCoveragePct;
            }
            if (b.successRatePct !== a.successRatePct) {
              return b.successRatePct - a.successRatePct;
            }
            return a.avgLatencyMs - b.avgLatencyMs;
          })[0]
        : null;

      if (result.ok) {
        if (updated?.latest && leader) {
          setLlmRunSummary(
            `LLM comparison completed. Leader ${leader.model} (coverage ${metricLabel(leader.avgCoveragePct, "%")}, success ${metricLabel(leader.successRatePct, "%")}, avg latency ${metricLabel(leader.avgLatencyMs, " ms")}). Run ID ${updated.latest.runId}.`,
          );
        } else {
          setLlmRunSummary("LLM comparison completed. Dashboard is refreshing.");
        }
      } else {
        setLlmRunSummary(summarizeFailure(result.returnCode, result.stderr, result.stdout));
      }
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : String(runError);
      setLlmRunSummary(`LLM comparison failed: ${message}`);
      setLlmRunTechnicalLog(compactLog(message));
    } finally {
      setLlmRunning(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <section className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Badge>Control Room</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">{project?.name ?? "x402Bench Agentic Payments"}</h1>
          <p className="max-w-2xl text-sm text-slate-300">
            {project?.tagline ?? "Benchmarking AI-agent payment reliability across orchestration, policy, and settlement rails."}
          </p>
          <div className="flex gap-2 pt-1">
            {(project?.sponsors ?? ["Hedera", "Chainlink", "Ledger"]).map((sponsor) => (
              <Badge key={sponsor} className="border-white/20 bg-white/5 text-white">
                {sponsor}
              </Badge>
            ))}
          </div>
        </div>
        <Card className="w-full max-w-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-300">Strict Mode</span>
            <button
              type="button"
              onClick={() => setStrict((previous) => !previous)}
              className={`h-6 w-11 rounded-full transition ${strict ? "bg-accent" : "bg-soft"}`}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-white transition ${strict ? "translate-x-5" : "translate-x-0.5"}`}
              />
            </button>
          </div>
          <Button onClick={handleRun} disabled={running} className="w-full gap-2">
            <RefreshCw size={16} className={running ? "animate-spin" : ""} />
            {running ? "Running benchmark..." : "Run Benchmark"}
          </Button>
          <p className="text-xs text-slate-300">{runSummary || "Run status will appear here."}</p>
          {runTechnicalLog ? (
            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer">Technical logs</summary>
              <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap rounded-lg bg-soft/60 p-2 text-[11px] leading-4">
                {runTechnicalLog}
              </pre>
            </details>
          ) : null}
        </Card>
      </section>

      {error ? (
        <Card className="mb-6 border-red-400/50">
          <p className="text-sm text-red-200">Failed to load dashboard: {error instanceof Error ? error.message : "Unknown error"}</p>
        </Card>
      ) : null}
      {llmError ? (
        <Card className="mb-6 border-red-400/50">
          <p className="text-sm text-red-200">
            Failed to load LLM benchmark dashboard: {llmError instanceof Error ? llmError.message : "Unknown error"}
          </p>
        </Card>
      ) : null}

      <section className="mb-6 grid gap-4 md:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">What This Benchmarks (Workflow)</h2>
          <p className="text-sm text-slate-300">
            {benchmarkDefinition?.workflow.whatIsBenchmarked ??
              "Policy gate, orchestration, settlement, and service-probe reliability for payment scenarios."}
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge className="border-white/20 bg-white/5 text-white">
              Mocked: {benchmarkDefinition?.workflow.mocked === false ? "No" : "Unknown"}
            </Badge>
            <Badge className="border-white/20 bg-white/5 text-white">
              Scenarios: {benchmarkDefinition?.workflow.scenarioCount ?? "-"}
            </Badge>
            <Badge className="border-white/20 bg-white/5 text-white">
              Integrations ready: {benchmarkDefinition?.workflow.integrationStatus?.isFullyConfigured ? "Yes" : "Partial"}
            </Badge>
          </div>
          <p className="text-xs text-slate-400">{benchmarkDefinition?.workflow.statusNote}</p>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">What This Benchmarks (LLM)</h2>
          <p className="text-sm text-slate-300">
            {benchmarkDefinition?.llm.whatIsBenchmarked ??
              "Decision quality and latency across policy and triage prompts from llm_bench/suite.json."}
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge className="border-white/20 bg-white/5 text-white">Runtime: {llmData?.track.runtime ?? "local_ollama"}</Badge>
            <Badge className="border-white/20 bg-white/5 text-white">
              Mocked: {benchmarkDefinition?.llm.mocked === false || llmData?.track.mocked === false ? "No" : "Unknown"}
            </Badge>
            <Badge className="border-white/20 bg-white/5 text-white">Tasks: {llmData?.track.tasks.length ?? 0}</Badge>
          </div>
          <p className="text-xs text-slate-400">
            Suite: {llmData?.track.suiteName ?? "x402Bench Agentic Payments LLM Eval"} | Path:{" "}
            <code>{llmData?.track.suitePath ?? "llm_bench/suite.json"}</code>
          </p>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="space-y-2">
          <div className="flex items-center gap-2 text-slate-300">
            <Gauge size={16} /> Overall Score
          </div>
          <p className="text-3xl font-semibold">{latest ? metricLabel(latest.overallScore) : "-"}</p>
          <p className="text-xs text-slate-400">Run ID: {latest?.runId ?? "No run yet"}</p>
        </Card>
        <Card className="space-y-2">
          <div className="flex items-center gap-2 text-slate-300">
            <ShieldCheck size={16} /> Success Rate
          </div>
          <p className="text-3xl font-semibold">{latest ? metricLabel(latest.successRate, "%") : "-"}</p>
          <p className="text-xs text-slate-400">
            {latest ? `${latest.successful}/${latest.totalScenarios} scenarios passed` : "Run benchmark to populate"}
          </p>
        </Card>
        <Card className="space-y-2">
          <div className="flex items-center gap-2 text-slate-300">
            <Timer size={16} /> P95 Total Latency
          </div>
          <p className="text-3xl font-semibold">{latest ? metricLabel(latest.p95TotalMs, " ms") : "-"}</p>
          <p className="text-xs text-slate-400">End-to-end latency across policy, orchestration, and settlement.</p>
        </Card>
        <Card className="space-y-2">
          <div className="flex items-center gap-2 text-slate-300">
            <AlertTriangle size={16} /> Failure Rate
          </div>
          <p className="text-3xl font-semibold">{latest ? metricLabel(latest.failureRate, "%") : "-"}</p>
          <p className="text-xs text-slate-400">Retries: {latest?.retries ?? 0}</p>
        </Card>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Score Breakdown</h2>
          <div className="space-y-3 text-sm text-slate-200">
            <div className="flex items-center justify-between rounded-lg bg-soft/70 p-3"><span>Reliability</span><span>{latest ? metricLabel(latest.reliabilityScore) : "-"}</span></div>
            <div className="flex items-center justify-between rounded-lg bg-soft/70 p-3"><span>Latency</span><span>{latest ? metricLabel(latest.latencyScore) : "-"}</span></div>
            <div className="flex items-center justify-between rounded-lg bg-soft/70 p-3"><span>Safety</span><span>{latest ? metricLabel(latest.safetyScore) : "-"}</span></div>
            <div className="flex items-center justify-between rounded-lg bg-soft/70 p-3"><span>Resilience</span><span>{latest ? metricLabel(latest.resilienceScore) : "-"}</span></div>
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Scenario Pressure Point</h2>
          {isLoading ? <p className="text-sm text-slate-300">Loading scenarios...</p> : null}
          {!isLoading && topScenario ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg bg-soft/70 p-3">
                <p className="font-semibold">{topScenario.name}</p>
                <p className="text-slate-300">Status: {topScenario.status}</p>
                <p className="text-slate-300">Duration: {metricLabel(topScenario.durationMs, " ms")}</p>
              </div>
              <div>
                <p className="mb-1 font-medium">Notes</p>
                <ul className="list-disc space-y-1 pl-5 text-slate-300">
                  {(topScenario.notes.length ? topScenario.notes : ["No blocking notes for this scenario."]).map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
          {!isLoading && !topScenario ? <p className="text-sm text-slate-300">Run benchmark to reveal scenario diagnostics.</p> : null}
        </Card>
      </section>

      <section className="mt-6">
        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Activity size={16} /> Scenario Ledger
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-300">
                <tr>
                  <th className="px-2 py-2">Scenario</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Duration (ms)</th>
                </tr>
              </thead>
              <tbody>
                {(data?.scenarios ?? []).map((scenario) => (
                  <tr key={scenario.id} className="border-t border-white/10">
                    <td className="px-2 py-2">{scenario.name}</td>
                    <td className="px-2 py-2 uppercase">{scenario.status}</td>
                    <td className="px-2 py-2">{metricLabel(scenario.durationMs)}</td>
                  </tr>
                ))}
                {(!data?.scenarios || data.scenarios.length === 0) && (
                  <tr>
                    <td className="px-2 py-3 text-slate-400" colSpan={3}>
                      No scenarios recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section className="mt-6">
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">LLM Model Comparison (Real Ollama Runs)</h2>
            <Badge className="border-white/20 bg-white/5 text-white">
              Latest run: {llmData?.latest?.runId ?? "No run yet"}
            </Badge>
          </div>
          <p className="text-sm text-slate-300">
            This run sends real prompts to your local Ollama API and compares models on coverage, success rate, and latency. No mocked
            LLM outputs are used.
          </p>

          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div className="space-y-2">
              <p className="text-sm font-medium">Select models to compare (2 to 6)</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(llmData?.availableModels ?? []).map((model) => {
                  const checked = selectedModels.includes(model);
                  const recommended = llmData?.recommendedModels.includes(model) ?? false;
                  return (
                    <label
                      key={model}
                      className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${
                        checked ? "border-accent bg-accent/15" : "border-white/15 bg-soft/60"
                      }`}
                    >
                      <span className="truncate pr-2">{model}</span>
                      <span className="flex items-center gap-2">
                        {recommended ? <Badge className="border-white/20 bg-white/10 text-white">recommended</Badge> : null}
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleModelSelection(model)}
                          className="h-4 w-4 accent-cyan-400"
                        />
                      </span>
                    </label>
                  );
                })}
              </div>
              {!llmData?.availableModels.length && !llmLoading ? (
                <p className="text-xs text-amber-200">
                  No Ollama models detected. Run <code>ollama list</code> and install at least 2 text models.
                </p>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="runs-per-task" className="text-sm font-medium">
                  Runs per task
                </label>
                <select
                  id="runs-per-task"
                  value={llmRunsPerTask}
                  onChange={(event) => setLlmRunsPerTask(Number(event.target.value))}
                  className="w-full rounded-lg border border-white/15 bg-soft/70 px-3 py-2 text-sm"
                >
                  <option value={1}>1 (fast)</option>
                  <option value={2}>2 (more stable)</option>
                  <option value={3}>3 (best signal)</option>
                </select>
              </div>
              <Button onClick={handleLlmRun} disabled={llmRunning || selectedModels.length < 2} className="w-full gap-2">
                <RefreshCw size={16} className={llmRunning ? "animate-spin" : ""} />
                {llmRunning ? "Running LLM comparison..." : "Run LLM Comparison"}
              </Button>
              <p className="text-xs text-slate-300">
                {llmRunSummary ||
                  "Pick at least 2 models. This executes real local inference across policy/triage benchmark tasks."}
              </p>
              {llmRunTechnicalLog ? (
                <details className="text-xs text-slate-400">
                  <summary className="cursor-pointer">Technical logs</summary>
                  <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap rounded-lg bg-soft/60 p-2 text-[11px] leading-4">
                    {llmRunTechnicalLog}
                  </pre>
                </details>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="bg-soft/40">
              <p className="text-xs uppercase tracking-wide text-slate-400">Models in last run</p>
              <p className="mt-2 text-sm text-slate-100">{llmData?.latest?.models.join(", ") || "No LLM run yet."}</p>
            </Card>
            <Card className="bg-soft/40">
              <p className="text-xs uppercase tracking-wide text-slate-400">Started</p>
              <p className="mt-2 text-sm text-slate-100">{formatDateTime(llmData?.latest?.startedAt)}</p>
            </Card>
            <Card className="bg-soft/40">
              <p className="text-xs uppercase tracking-wide text-slate-400">Current leader</p>
              <p className="mt-2 text-sm text-slate-100">
                {llmLeader
                  ? `${llmLeader.model} (rank ${metricLabel(
                      modelRankScore(llmLeader.avgCoveragePct, llmLeader.successRatePct, llmLeader.avgLatencyMs),
                    )})`
                  : "No comparison yet"}
              </p>
            </Card>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-300">
                <tr>
                  <th className="px-2 py-2">Model</th>
                  <th className="px-2 py-2">Avg Latency (ms)</th>
                  <th className="px-2 py-2">P95 Latency (ms)</th>
                  <th className="px-2 py-2">Coverage (%)</th>
                  <th className="px-2 py-2">Success (%)</th>
                </tr>
              </thead>
              <tbody>
                {llmRows.map((row) => (
                  <tr key={row.model} className="border-t border-white/10">
                    <td className="px-2 py-2">{row.model}</td>
                    <td className="px-2 py-2">{metricLabel(row.avgLatencyMs)}</td>
                    <td className="px-2 py-2">{metricLabel(row.p95LatencyMs)}</td>
                    <td className="px-2 py-2">{metricLabel(row.avgCoveragePct)}</td>
                    <td className="px-2 py-2">{metricLabel(row.successRatePct)}</td>
                  </tr>
                ))}
                {llmRows.length === 0 && !llmLoading ? (
                  <tr>
                    <td className="px-2 py-3 text-slate-400" colSpan={5}>
                      No LLM comparison results yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </main>
  );
}
