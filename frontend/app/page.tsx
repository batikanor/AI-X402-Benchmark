"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Brain,
  ChevronDown,
  Gauge,
  RefreshCw,
  ShieldCheck,
  Timer,
  Workflow,
} from "lucide-react";
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

function scenarioFailureReason(notes: string[]): string {
  if (!notes.length) {
    return "No failure note";
  }
  return notes[0];
}

type WorkflowMissingItem = {
  integration: string;
  required: string;
  reason: string;
};

type DisclosureProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
};

function Disclosure({ title, subtitle, children, defaultOpen = false }: DisclosureProps) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-white/10 bg-soft/40 p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <div>
          <p className="text-sm font-semibold text-slate-100">{title}</p>
          {subtitle ? <p className="text-xs text-slate-400">{subtitle}</p> : null}
        </div>
        <ChevronDown size={16} className="text-slate-400 transition group-open:rotate-180" />
      </summary>
      <div className="pt-4">{children}</div>
    </details>
  );
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
  const workflowStatus = benchmarkDefinition?.workflow.integrationStatus;

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

  const workflowMissing: WorkflowMissingItem[] = useMemo(() => {
    if (!workflowStatus) {
      return [];
    }

    const missing: WorkflowMissingItem[] = [];

    if (!workflowStatus.hedera.configured) {
      missing.push({
        integration: "Hedera",
        required:
          workflowStatus.hedera.mode === "sdk"
            ? "HEDERA_OPERATOR_ID + HEDERA_OPERATOR_KEY"
            : "HEDERA_RELAY_URL",
        reason: workflowStatus.hedera.reason,
      });
    }

    if (!workflowStatus.chainlink.configured) {
      missing.push({
        integration: "Chainlink",
        required: workflowStatus.chainlink.mode === "cli" ? "CHAINLINK_MODE=cli" : "CHAINLINK_WEBHOOK_URL",
        reason: workflowStatus.chainlink.reason,
      });
    }

    if (!workflowStatus.ledger.configured) {
      missing.push({
        integration: "Ledger",
        required: workflowStatus.ledger.mode === "ledger_hw" ? "LEDGER_MODE=ledger_hw" : "LEDGER_APPROVER_URL",
        reason: workflowStatus.ledger.reason,
      });
    }

    if (!workflowStatus.serviceProbe.configured) {
      missing.push({
        integration: "Service Probe",
        required: "SERVICE_PROBE_URL",
        reason: workflowStatus.serviceProbe.reason,
      });
    }

    return missing;
  }, [workflowStatus]);

  const workflowEnvSnippet = useMemo(() => {
    const lines: string[] = [];
    for (const item of workflowMissing) {
      switch (item.required) {
        case "HEDERA_OPERATOR_ID + HEDERA_OPERATOR_KEY":
          lines.push("HEDERA_OPERATOR_ID=0.0.xxxxx");
          lines.push("HEDERA_OPERATOR_KEY=302e0201...");
          break;
        case "HEDERA_RELAY_URL":
          lines.push("HEDERA_RELAY_URL=https://your-hedera-relay.example");
          break;
        case "CHAINLINK_MODE=cli":
          lines.push("CHAINLINK_MODE=cli");
          break;
        case "CHAINLINK_WEBHOOK_URL":
          lines.push("CHAINLINK_WEBHOOK_URL=https://your-chainlink-webhook.example");
          break;
        case "LEDGER_MODE=ledger_hw":
          lines.push("LEDGER_MODE=ledger_hw");
          break;
        case "LEDGER_APPROVER_URL":
          lines.push("LEDGER_APPROVER_URL=https://your-ledger-approver.example");
          break;
        case "SERVICE_PROBE_URL":
          lines.push("SERVICE_PROBE_URL=https://your-service-probe.example/health");
          break;
        default:
          lines.push(`${item.required}=...`);
      }
    }
    return lines.length ? lines.join("\n") : "# Workflow integrations are configured";
  }, [workflowMissing]);

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
            `Workflow run completed. Score ${metricLabel(latestAfterRun.overallScore)}, success ${latestAfterRun.successful}/${latestAfterRun.totalScenarios}, p95 ${metricLabel(latestAfterRun.p95TotalMs, " ms")}, run ID ${latestAfterRun.runId}.`,
          );
        } else {
          setRunSummary("Workflow run completed. Dashboard is refreshing with latest metrics.");
        }
      } else {
        setRunSummary(summarizeFailure(result.returnCode, result.stderr, result.stdout));
      }
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : String(runError);
      setRunSummary(`Workflow run failed: ${message}`);
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
    <main className="mx-auto max-w-7xl px-6 py-10">
      <section className="mb-6 space-y-3">
        <Badge>Control Room</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">x402Bench Payment Reliability</h1>
        <p className="max-w-4xl text-sm text-slate-300">
          This dashboard has two separate benchmarks. One measures end-to-end payment workflow execution across sponsor integrations. The other measures LLM decision quality and latency. They are related conceptually, but they are executed as separate tracks.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="border-cyan-300/20 bg-cyan-500/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-cyan-100">
              <Workflow size={16} />
              <p className="font-semibold">Track 1: Payment Workflow Reliability</p>
            </div>
            <p className="text-sm text-slate-200">
              Uses LLM inference: <strong>No</strong>. This track validates policy checks, orchestration calls, Hedera settlement, and service verification.
            </p>
          </Card>
          <Card className="border-fuchsia-300/20 bg-fuchsia-500/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-fuchsia-100">
              <Brain size={16} />
              <p className="font-semibold">Track 2: LLM Decision Quality</p>
            </div>
            <p className="text-sm text-slate-200">
              Uses on-chain settlement: <strong>No</strong>. This track compares local models on benchmark prompts for decision quality and response latency.
            </p>
          </Card>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {(project?.sponsors ?? ["Hedera", "Chainlink", "Ledger"]).map((sponsor) => (
            <Badge key={sponsor} className="border-white/20 bg-white/5 text-white">
              {sponsor}
            </Badge>
          ))}
        </div>
      </section>

      {error ? (
        <Card className="mb-6 border-red-400/50 p-4">
          <p className="text-sm text-red-200">Failed to load workflow dashboard: {error instanceof Error ? error.message : "Unknown error"}</p>
        </Card>
      ) : null}

      {llmError ? (
        <Card className="mb-6 border-red-400/50 p-4">
          <p className="text-sm text-red-200">
            Failed to load LLM benchmark dashboard: {llmError instanceof Error ? llmError.message : "Unknown error"}
          </p>
        </Card>
      ) : null}

      <section className="space-y-6">
        <Card className="space-y-6 border-cyan-400/20 bg-panel/95 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <Badge className="border-cyan-300/40 bg-cyan-400/10 text-cyan-100">Workflow Benchmark</Badge>
              <h2 className="text-2xl font-semibold">Payment Workflow Reliability Benchmark</h2>
              <p className="max-w-3xl text-sm text-slate-300">
                {benchmarkDefinition?.workflow.whatIsBenchmarked ??
                  "Policy gate, orchestration, settlement, and service probe reliability for payment scenarios."}
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge className="border-white/20 bg-white/5 text-white">Uses LLMs: No</Badge>
                <Badge className="border-white/20 bg-white/5 text-white">
                  Mocked: {benchmarkDefinition?.workflow.mocked === false ? "No" : "Unknown"}
                </Badge>
                <Badge className="border-white/20 bg-white/5 text-white">
                  Scenarios: {benchmarkDefinition?.workflow.scenarioCount ?? "-"}
                </Badge>
                <Badge className="border-white/20 bg-white/5 text-white">
                  Integrations ready: {workflowStatus?.isFullyConfigured ? "Yes" : "Partial"}
                </Badge>
              </div>
              <p className="text-xs text-slate-400">{benchmarkDefinition?.workflow.statusNote}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-soft/60 px-4 py-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-slate-400">Workflow Run ID</p>
              <p className="font-medium text-slate-100">{latest?.runId ?? "No run yet"}</p>
            </div>
          </div>

          <Disclosure
            title="What this track means in plain language"
            subtitle="Opened only when you want details"
          >
            <div className="space-y-3 text-sm text-slate-200">
              <p>
                This track tests whether your payment process works from start to finish under real integration rules.
              </p>
              <p>
                It checks: (1) policy gate, (2) orchestration trigger, (3) settlement write, and (4) service verification.
              </p>
              <p>
                Sponsor mapping: Hedera = settlement proof, Chainlink = orchestration proof, Ledger = approval/policy proof.
              </p>
            </div>
          </Disclosure>

          {workflowMissing.length > 0 ? (
            <div className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-4">
              <div className="flex items-center gap-2 text-amber-100">
                <AlertTriangle size={16} />
                <p className="font-semibold">Some required integrations are missing</p>
              </div>
              <p className="mt-2 text-sm text-amber-50/90">
                Core cards still load, but scenarios will fail fast until these inputs are configured.
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
            <Card className="space-y-3 bg-soft/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Strict Mode</span>
                <button
                  type="button"
                  onClick={() => setStrict((previous) => !previous)}
                  className={`h-6 w-11 rounded-full transition ${strict ? "bg-accent" : "bg-soft"}`}
                >
                  <span className={`block h-5 w-5 rounded-full bg-white transition ${strict ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>
              <Button onClick={handleRun} disabled={running} className="w-full gap-2">
                <RefreshCw size={16} className={running ? "animate-spin" : ""} />
                {running ? "Running workflow benchmark..." : "Run Workflow Benchmark"}
              </Button>
              <p className="text-xs text-slate-300">{runSummary || "Workflow run status will appear here."}</p>
              {runTechnicalLog ? (
                <details className="text-xs text-slate-400">
                  <summary className="cursor-pointer">Show workflow technical logs</summary>
                  <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap rounded-lg bg-soft/60 p-2 text-[11px] leading-4">
                    {runTechnicalLog}
                  </pre>
                </details>
              ) : null}
            </Card>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Card className="space-y-2 bg-soft/50 p-4">
                <div className="flex items-center gap-2 text-slate-300">
                  <Gauge size={16} /> Workflow Score
                </div>
                <p className="text-3xl font-semibold">{latest ? metricLabel(latest.overallScore) : "-"}</p>
              </Card>
              <Card className="space-y-2 bg-soft/50 p-4">
                <div className="flex items-center gap-2 text-slate-300">
                  <ShieldCheck size={16} /> Workflow Success
                </div>
                <p className="text-3xl font-semibold">{latest ? metricLabel(latest.successRate, "%") : "-"}</p>
                <p className="text-xs text-slate-400">
                  {latest ? `${latest.successful}/${latest.totalScenarios} scenarios passed` : "Run workflow benchmark to populate"}
                </p>
              </Card>
              <Card className="space-y-2 bg-soft/50 p-4">
                <div className="flex items-center gap-2 text-slate-300">
                  <Timer size={16} /> Workflow P95
                </div>
                <p className="text-3xl font-semibold">{latest ? metricLabel(latest.p95TotalMs, " ms") : "-"}</p>
              </Card>
              <Card className="space-y-2 bg-soft/50 p-4">
                <div className="flex items-center gap-2 text-slate-300">
                  <AlertTriangle size={16} /> Workflow Fail Rate
                </div>
                <p className="text-3xl font-semibold">{latest ? metricLabel(latest.failureRate, "%") : "-"}</p>
                <p className="text-xs text-slate-400">Retries: {latest?.retries ?? 0}</p>
              </Card>
            </div>
          </div>

          <Disclosure title="Setup and required inputs" subtitle="Environment variables, missing requirements, and config path">
            <div className="space-y-4">
              {workflowMissing.length > 0 ? (
                <div className="space-y-2 text-sm">
                  {workflowMissing.map((item) => (
                    <div key={item.integration} className="rounded-lg border border-amber-200/20 bg-black/15 px-3 py-2">
                      <p className="font-medium text-amber-50">{item.integration}</p>
                      <p className="text-amber-50/90">Required input: {item.required}</p>
                      <p className="text-amber-50/80">Reason: {item.reason}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-emerald-200">All required workflow integrations are configured.</p>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="bg-soft/50 p-4">
                  <p className="mb-2 text-sm font-semibold">Environment snippet</p>
                  <pre className="overflow-auto rounded-lg bg-black/25 p-3 text-[11px] leading-5 text-slate-100">{workflowEnvSnippet}</pre>
                </Card>

                <Card className="bg-soft/50 p-4">
                  <p className="mb-2 text-sm font-semibold">Config file path</p>
                  <p className="text-xs text-slate-300">
                    <code>config/benchmark.config.json</code>
                  </p>
                  <p className="mt-3 text-xs text-slate-400">After changing config/env, run the workflow benchmark again.</p>
                </Card>
              </div>
            </div>
          </Disclosure>

          <Disclosure title="Diagnostics and score breakdown" subtitle="Off by default to keep the main view clean">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="bg-soft/50 p-4">
                <h3 className="mb-3 text-lg font-semibold">Workflow Score Breakdown</h3>
                <div className="space-y-3 text-sm text-slate-200">
                  <div className="flex items-center justify-between rounded-lg bg-soft/70 p-3"><span>Reliability</span><span>{latest ? metricLabel(latest.reliabilityScore) : "-"}</span></div>
                  <div className="flex items-center justify-between rounded-lg bg-soft/70 p-3"><span>Latency</span><span>{latest ? metricLabel(latest.latencyScore) : "-"}</span></div>
                  <div className="flex items-center justify-between rounded-lg bg-soft/70 p-3"><span>Safety</span><span>{latest ? metricLabel(latest.safetyScore) : "-"}</span></div>
                  <div className="flex items-center justify-between rounded-lg bg-soft/70 p-3"><span>Resilience</span><span>{latest ? metricLabel(latest.resilienceScore) : "-"}</span></div>
                </div>
              </Card>

              <Card className="bg-soft/50 p-4">
                <h3 className="mb-3 text-lg font-semibold">Scenario Pressure Point</h3>
                {isLoading ? <p className="text-sm text-slate-300">Loading scenarios...</p> : null}
                {!isLoading && data?.scenarios.length ? (
                  <div className="space-y-3 text-sm">
                    {(() => {
                      const topScenario = [...data.scenarios].sort((a, b) => b.durationMs - a.durationMs)[0];
                      return (
                        <>
                          <div className="rounded-lg bg-soft/70 p-3">
                            <p className="font-semibold">{topScenario.name}</p>
                            <p className="text-slate-300">Status: {topScenario.status}</p>
                            <p className="text-slate-300">Duration: {metricLabel(topScenario.durationMs, " ms")}</p>
                          </div>
                          <div>
                            <p className="mb-1 font-medium">Primary note</p>
                            <p className="rounded-lg bg-soft/70 p-3 text-slate-300">{scenarioFailureReason(topScenario.notes)}</p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : null}
                {!isLoading && (!data?.scenarios || data.scenarios.length === 0) ? (
                  <p className="text-sm text-slate-300">Run workflow benchmark to reveal scenario diagnostics.</p>
                ) : null}
              </Card>
            </div>
          </Disclosure>

          <Disclosure title="Workflow scenario ledger" subtitle="Per-scenario status and failure reason">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-slate-300">
                  <tr>
                    <th className="px-2 py-2">Scenario</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Duration (ms)</th>
                    <th className="px-2 py-2">Failure reason</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.scenarios ?? []).map((scenario) => (
                    <tr key={scenario.id} className="border-t border-white/10 align-top">
                      <td className="px-2 py-2">{scenario.name}</td>
                      <td className="px-2 py-2 uppercase">{scenario.status}</td>
                      <td className="px-2 py-2">{metricLabel(scenario.durationMs)}</td>
                      <td className="px-2 py-2 text-slate-300">{scenarioFailureReason(scenario.notes)}</td>
                    </tr>
                  ))}
                  {(!data?.scenarios || data.scenarios.length === 0) && (
                    <tr>
                      <td className="px-2 py-3 text-slate-400" colSpan={4}>
                        No workflow scenarios recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Disclosure>
        </Card>

        <Card className="space-y-6 border-fuchsia-400/20 bg-panel/95 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <Badge className="border-fuchsia-300/40 bg-fuchsia-400/10 text-fuchsia-100">LLM Benchmark</Badge>
              <h2 className="text-2xl font-semibold">LLM Decision Benchmark</h2>
              <p className="max-w-3xl text-sm text-slate-300">
                {benchmarkDefinition?.llm.whatIsBenchmarked ??
                  "Decision quality and latency across policy/triage prompts from llm_bench/suite.json."}
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge className="border-white/20 bg-white/5 text-white">Runtime: {llmData?.track.runtime ?? "local_ollama"}</Badge>
                <Badge className="border-white/20 bg-white/5 text-white">Uses on-chain settlement: No</Badge>
                <Badge className="border-white/20 bg-white/5 text-white">
                  Mocked: {benchmarkDefinition?.llm.mocked === false || llmData?.track.mocked === false ? "No" : "Unknown"}
                </Badge>
                <Badge className="border-white/20 bg-white/5 text-white">Tasks: {llmData?.track.tasks?.length ?? 0}</Badge>
              </div>
              <p className="text-xs text-slate-400">
                Suite: x402Bench Payment Systems LLM Eval | Path: <code>{llmData?.track.suitePath ?? "llm_bench/suite.json"}</code>
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-soft/60 px-4 py-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-slate-400">LLM Run ID</p>
              <p className="font-medium text-slate-100">{llmData?.latest?.runId ?? "No run yet"}</p>
            </div>
          </div>

          <Disclosure title="How this differs from workflow track" subtitle="Why there are two benchmarks">
            <div className="space-y-2 text-sm text-slate-200">
              <p>Workflow track asks: can the payment process execute reliably across integrations?</p>
              <p>LLM track asks: which model makes stronger, faster decisions on benchmark prompts?</p>
              <p>You use both together: decision quality from this track, execution reliability from workflow track.</p>
            </div>
          </Disclosure>

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

            <Card className="space-y-3 bg-soft/50 p-4">
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
                  "Pick at least 2 models. This executes real local inference across benchmark tasks."}
              </p>
              {llmRunTechnicalLog ? (
                <details className="text-xs text-slate-400">
                  <summary className="cursor-pointer">Show LLM technical logs</summary>
                  <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap rounded-lg bg-soft/60 p-2 text-[11px] leading-4">
                    {llmRunTechnicalLog}
                  </pre>
                </details>
              ) : null}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="bg-soft/50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Models in last run</p>
              <p className="mt-2 text-sm text-slate-100">{llmData?.latest?.models.join(", ") || "No LLM run yet."}</p>
            </Card>
            <Card className="bg-soft/50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Started</p>
              <p className="mt-2 text-sm text-slate-100">{formatDateTime(llmData?.latest?.startedAt)}</p>
            </Card>
            <Card className="bg-soft/50 p-4">
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

          <Disclosure title="Model comparison table" subtitle="Hidden by default to keep focus on top metrics">
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
          </Disclosure>
        </Card>
      </section>
    </main>
  );
}
