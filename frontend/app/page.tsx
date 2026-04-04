"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Brain, ChevronDown, Gauge, RefreshCw, ShieldCheck, Timer, Workflow } from "lucide-react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchReadinessDashboard, runReadinessBenchmark } from "@/lib/api";

type RuntimeMode = "ollama" | "openai_compat";

const HF_OPENAI_COMPAT_URL = "https://router.huggingface.co/v1";

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

type MissingIntegration = {
  integration: string;
  mode?: string;
  reason: string;
  required: string;
};

function normalizeWorkflowStatus(status: string | undefined): string {
  const value = String(status || "").toLowerCase();
  if (value === "success") return "success";
  if (value.includes("failed")) return "failed";
  if (value.includes("blocked")) return "blocked";
  if (value.includes("mismatch")) return "decision mismatch";
  if (value === "skipped") return "skipped";
  return value || "unknown";
}

function rowTopIssue(notes: string[]): string {
  if (!notes.length) return "No note";
  return notes[0];
}

function parseModelCsv(value: string): string[] {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(items)).slice(0, 8);
}

export default function HomePage() {
  const { data, error, isLoading, mutate } = useSWR("readiness-dashboard", fetchReadinessDashboard, {
    refreshInterval: 15000,
  });

  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [runtime, setRuntime] = useState<RuntimeMode>("ollama");
  const [customModels, setCustomModels] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [apiKeyEnv, setApiKeyEnv] = useState("HF_TOKEN");
  const [docsPackPath, setDocsPackPath] = useState("");
  const [docsTopK, setDocsTopK] = useState(5);
  const [requireCitations, setRequireCitations] = useState(true);
  const [runsPerScenario, setRunsPerScenario] = useState(1);
  const [running, setRunning] = useState(false);
  const [runSummary, setRunSummary] = useState("");
  const [runTechnicalLog, setRunTechnicalLog] = useState("");

  useEffect(() => {
    if (!data?.availableModels.length) return;
    setSelectedModels((previous) => {
      const filtered = previous.filter((model) => data.availableModels.includes(model));
      if (filtered.length >= 2) return filtered;
      const seeded = [...data.recommendedModels, ...data.availableModels];
      return Array.from(new Set(seeded)).slice(0, Math.min(6, data.availableModels.length));
    });
  }, [data]);

  useEffect(() => {
    if (runtime !== "openai_compat") return;
    setApiBaseUrl((previous) => previous || HF_OPENAI_COMPAT_URL);
  }, [runtime]);

  useEffect(() => {
    const docs = data?.track.docs;
    if (!docs) return;
    setDocsTopK((previous) => (previous > 0 ? previous : docs.topK || 5));
    setRequireCitations(docs.requireCitations);
    if (!docsPackPath && docs.defaultPackPath) {
      setDocsPackPath(docs.defaultPackPath);
    }
  }, [data?.track.docs, docsPackPath]);

  const sortedModels = useMemo(() => {
    if (!data?.models.length) return [];
    return [...data.models].sort((a, b) => {
      if (b.overallScore !== a.overallScore) return b.overallScore - a.overallScore;
      if (b.decisionAccuracyPct !== a.decisionAccuracyPct) return b.decisionAccuracyPct - a.decisionAccuracyPct;
      return a.avgTotalLatencyMs - b.avgTotalLatencyMs;
    });
  }, [data?.models]);

  const leader = sortedModels[0];

  const missingIntegrations: MissingIntegration[] = useMemo(() => {
    const status = data?.track.integrationStatus;
    if (!status) return [];

    const missing: MissingIntegration[] = [];
    if (!status.hedera.configured) {
      missing.push({
        integration: "Hedera",
        mode: status.hedera.mode,
        reason: status.hedera.reason,
        required:
          status.hedera.mode === "sdk"
            ? "HEDERA_OPERATOR_ID + HEDERA_OPERATOR_KEY"
            : "HEDERA_RELAY_URL",
      });
    }
    if (!status.chainlink.configured) {
      missing.push({
        integration: "Chainlink",
        mode: status.chainlink.mode,
        reason: status.chainlink.reason,
        required:
          status.chainlink.mode === "cli" ? "CHAINLINK_MODE=cli" : "CHAINLINK_WEBHOOK_URL",
      });
    }
    if (!status.ledger.configured) {
      missing.push({
        integration: "Ledger",
        mode: status.ledger.mode,
        reason: status.ledger.reason,
        required:
          status.ledger.mode === "ledger_hw" ? "LEDGER_MODE=ledger_hw" : "LEDGER_APPROVER_URL",
      });
    }
    if (!status.serviceProbe.configured) {
      missing.push({
        integration: "Service Probe",
        reason: status.serviceProbe.reason,
        required: "SERVICE_PROBE_URL",
      });
    }
    return missing;
  }, [data?.track.integrationStatus]);

  const envSnippet = useMemo(() => {
    const lines: string[] = [];

    if (missingIntegrations.some((item) => item.required.includes("HEDERA_OPERATOR_ID"))) {
      lines.push("HEDERA_OPERATOR_ID=0.0.xxxxx");
      lines.push("HEDERA_OPERATOR_KEY=302e0201...");
    }
    if (missingIntegrations.some((item) => item.required === "HEDERA_RELAY_URL")) {
      lines.push("HEDERA_RELAY_URL=https://your-hedera-relay.example");
    }
    if (missingIntegrations.some((item) => item.required === "CHAINLINK_WEBHOOK_URL")) {
      lines.push("CHAINLINK_WEBHOOK_URL=https://your-chainlink-webhook.example");
    }
    if (missingIntegrations.some((item) => item.required === "LEDGER_APPROVER_URL")) {
      lines.push("LEDGER_APPROVER_URL=https://your-ledger-approver.example");
    }
    if (missingIntegrations.some((item) => item.required === "SERVICE_PROBE_URL")) {
      lines.push("SERVICE_PROBE_URL=https://your-service-probe.example/health");
    }

    if (!lines.length) {
      lines.push("# explicit integration env vars are configured");
    }

    lines.push("");
    lines.push("# API-triggered runs also auto-wire local integration fallbacks");
    lines.push("# CHAINLINK_WEBHOOK_URL=/api/v1/integrations/chainlink/webhook");
    lines.push("# LEDGER_APPROVER_URL=/api/v1/integrations/ledger/approver");
    lines.push("# SERVICE_PROBE_URL=/api/v1/integrations/service-probe");

    return lines.join("\n");
  }, [missingIntegrations]);

  const scenarioRows = useMemo(() => {
    const scenarios = data?.scenarios ?? [];
    const results = data?.results ?? [];

    return scenarios.map((scenario) => {
      const byModel = sortedModels.map((modelRow) => {
        const attemptRows = results
          .filter((row) => (row.caseId ?? row.scenarioId) === scenario.id && row.model === modelRow.model)
          .sort((a, b) => b.attempt - a.attempt);
        return {
          model: modelRow.model,
          latest: attemptRows[0] ?? null,
        };
      });

      return {
        scenario,
        byModel,
      };
    });
  }, [data?.results, data?.scenarios, sortedModels]);

  const effectiveModels = useMemo(() => {
    const parsed = parseModelCsv(customModels);
    if (parsed.length) return parsed;
    return selectedModels;
  }, [customModels, selectedModels]);

  function toggleModelSelection(model: string) {
    setSelectedModels((previous) => {
      if (previous.includes(model)) {
        return previous.filter((item) => item !== model);
      }
      if (previous.length >= 8) {
        return previous;
      }
      return [...previous, model];
    });
  }

  async function handleRun() {
    if (effectiveModels.length < 2) {
      setRunSummary("Select at least 2 models to run a readiness comparison.");
      return;
    }

    try {
      setRunning(true);
      const result = await runReadinessBenchmark({
        models: effectiveModels,
        runtime,
        apiBaseUrl: apiBaseUrl.trim() || undefined,
        apiKeyEnv: apiKeyEnv.trim() || undefined,
        docsPackPath: docsPackPath.trim() || undefined,
        docsTopK,
        requireCitations,
        runsPerScenario,
        maxTokens: 512,
        temperature: 0.1,
      });

      setRunTechnicalLog(compactLog(result.stdout || result.stderr || ""));
      const updated = await mutate();
      const topModel = updated?.models?.length
        ? [...updated.models].sort((a, b) => b.overallScore - a.overallScore)[0]
        : null;

      if (result.ok) {
        if (updated?.latest && topModel) {
          setRunSummary(
            `Readiness run completed. Leader ${topModel.model} with score ${metricLabel(topModel.overallScore)}. Decision accuracy ${metricLabel(topModel.decisionAccuracyPct, "%")}, docs grounded ${metricLabel(topModel.docsGroundingRatePct, "%")}, workflow success ${metricLabel(topModel.workflowSuccessRatePct, "%")}. Run ID ${updated.latest.runId}.`,
          );
        } else {
          setRunSummary("Readiness run completed. Dashboard is refreshing.");
        }
      } else {
        setRunSummary(`Readiness run not completed (code ${result.returnCode}). Check technical logs.`);
      }
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : String(runError);
      setRunSummary(`Readiness run failed: ${message}`);
      setRunTechnicalLog(compactLog(message));
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <section className="mb-6 space-y-3">
        <Badge>Control Room</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">x402Bench LLM Readiness</h1>
        <p className="max-w-4xl text-sm text-slate-300">
          One benchmark run, one leaderboard: each model is scored on policy/routing decision quality and on real workflow execution outcomes.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="border-fuchsia-300/20 bg-fuchsia-500/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-fuchsia-100">
              <Brain size={16} />
              <p className="font-semibold">Dimension A: Decision Quality</p>
            </div>
            <p className="text-sm text-slate-200">
              Checks if the model returns the correct decision, approval requirement, and priority for each payment scenario.
            </p>
          </Card>
          <Card className="border-cyan-300/20 bg-cyan-500/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-cyan-100">
              <Workflow size={16} />
              <p className="font-semibold">Dimension B: Execution Reliability</p>
            </div>
            <p className="text-sm text-slate-200">
              If the decision is correct and executable, the workflow runs through Chainlink, Hedera, and Ledger controls and is scored on success and latency.
            </p>
          </Card>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {(data?.project.sponsors ?? ["Hedera", "Chainlink", "Ledger"]).map((sponsor) => (
            <Badge key={sponsor} className="border-white/20 bg-white/5 text-white">
              {sponsor}
            </Badge>
          ))}
        </div>
      </section>

      {error ? (
        <Card className="mb-6 border-red-400/50 p-4">
          <p className="text-sm text-red-200">
            Failed to load readiness dashboard: {error instanceof Error ? error.message : "Unknown error"}
          </p>
        </Card>
      ) : null}

      <section className="space-y-6">
        <Card className="space-y-6 border-white/15 bg-panel/95 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <Badge className="border-white/20 bg-white/10 text-white">Integrated Benchmark</Badge>
              <h2 className="text-2xl font-semibold">LLM Readiness for Payment Workflows</h2>
              <p className="max-w-3xl text-sm text-slate-300">
                {data?.track.whatIsBenchmarked ??
                  "Whether models make correct policy/routing decisions and whether those decisions execute successfully through sponsor integrations."}
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge className="border-white/20 bg-white/5 text-white">Mocked: {data?.track.mocked === false ? "No" : "Unknown"}</Badge>
                <Badge className="border-white/20 bg-white/5 text-white">Cases: {data?.track.scenarioCount ?? "-"}</Badge>
                <Badge className="border-white/20 bg-white/5 text-white">Runtime: {data?.latest?.runtime ?? data?.track.runtimeUsed ?? "-"}</Badge>
                <Badge className="border-white/20 bg-white/5 text-white">
                  Suite: {data?.track.suiteName ?? "-"} v{data?.track.suiteVersion ?? "-"}
                </Badge>
                <Badge className="border-white/20 bg-white/5 text-white">
                  Docs grounding: {data?.track.docs?.enabled ? "On" : "Off"}
                </Badge>
                <Badge className="border-white/20 bg-white/5 text-white">
                  Docs sources: {data?.latest?.docs?.sourceCount ?? data?.track.docs?.sourceCount ?? 0}
                </Badge>
                <Badge className="border-white/20 bg-white/5 text-white">
                  Integrations ready: {data?.track.integrationStatus?.isFullyConfigured ? "Yes" : "Partial"}
                </Badge>
              </div>
              <p className="text-xs text-slate-400">{data?.track.statusNote}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-soft/60 px-4 py-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-slate-400">Latest Run ID</p>
              <p className="font-medium text-slate-100">{data?.latest?.runId ?? "No run yet"}</p>
              <p className="mt-1 text-xs text-slate-400">{formatDateTime(data?.latest?.finishedAt)}</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="runtime-mode" className="text-sm font-medium">
                  Model runtime
                </label>
                <select
                  id="runtime-mode"
                  value={runtime}
                  onChange={(event) => setRuntime(event.target.value as RuntimeMode)}
                  className="w-full rounded-lg border border-white/15 bg-soft/70 px-3 py-2 text-sm"
                >
                  <option value="ollama">Ollama (local models)</option>
                  <option value="openai_compat">OpenAI-compatible (HF Router/OpenRouter/hosted)</option>
                </select>
              </div>

              <p className="text-sm font-medium">Select models to benchmark (2 to 8)</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(data?.availableModels ?? []).map((model) => {
                  const checked = selectedModels.includes(model);
                  const recommended = data?.recommendedModels.includes(model) ?? false;
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
              {!data?.availableModels.length && !isLoading && runtime === "ollama" ? (
                <p className="text-xs text-amber-200">
                  No Ollama models detected. Install at least 2 text models first.
                </p>
              ) : null}

              <Card className="space-y-2 bg-soft/50 p-4">
                <label htmlFor="custom-models" className="text-sm font-medium">
                  Custom model list (comma-separated, overrides checkbox selection when filled)
                </label>
                <input
                  id="custom-models"
                  value={customModels}
                  onChange={(event) => setCustomModels(event.target.value)}
                  placeholder="gemma4:e4b,qwen3:4b-instruct,phi4:14b"
                  className="w-full rounded-lg border border-white/15 bg-soft/70 px-3 py-2 text-sm"
                />
                <p className="text-xs text-slate-400">Effective models: {effectiveModels.length ? effectiveModels.join(", ") : "-"}</p>
              </Card>

              {runtime === "openai_compat" ? (
                <Card className="space-y-3 bg-soft/50 p-4">
                  <div className="space-y-1">
                    <label htmlFor="api-base-url" className="text-sm font-medium">
                      OpenAI-compatible base URL
                    </label>
                    <input
                      id="api-base-url"
                      value={apiBaseUrl}
                      onChange={(event) => setApiBaseUrl(event.target.value)}
                      placeholder={HF_OPENAI_COMPAT_URL}
                      className="w-full rounded-lg border border-white/15 bg-soft/70 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="api-key-env" className="text-sm font-medium">
                      API key env var name
                    </label>
                    <input
                      id="api-key-env"
                      value={apiKeyEnv}
                      onChange={(event) => setApiKeyEnv(event.target.value.toUpperCase())}
                      placeholder="HF_TOKEN"
                      className="w-full rounded-lg border border-white/15 bg-soft/70 px-3 py-2 text-sm"
                    />
                  </div>
                  <p className="text-xs text-slate-400">
                    For Hugging Face Router, set <code>HF_TOKEN</code> and use <code>{HF_OPENAI_COMPAT_URL}</code>.
                  </p>
                </Card>
              ) : null}

              <Card className="space-y-3 bg-soft/50 p-4">
                <p className="text-sm font-medium">Documentation grounding</p>
                <div className="space-y-1">
                  <label htmlFor="docs-pack-path" className="text-sm font-medium">
                    Docs pack path (JSON)
                  </label>
                  <input
                    id="docs-pack-path"
                    value={docsPackPath}
                    onChange={(event) => setDocsPackPath(event.target.value)}
                    placeholder={data?.track.docs?.defaultPackPath ?? "readiness_bench/docs_cache/default_docs_pack.json"}
                    className="w-full rounded-lg border border-white/15 bg-soft/70 px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="docs-top-k" className="text-sm font-medium">
                    Retrieved excerpts per case
                  </label>
                  <select
                    id="docs-top-k"
                    value={docsTopK}
                    onChange={(event) => setDocsTopK(Number(event.target.value))}
                    className="w-full rounded-lg border border-white/15 bg-soft/70 px-3 py-2 text-sm"
                  >
                    {[3, 4, 5, 6, 8, 10, 12].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={requireCitations}
                    onChange={(event) => setRequireCitations(event.target.checked)}
                    className="h-4 w-4 accent-cyan-400"
                  />
                  Require citation coverage for passing
                </label>
                <p className="text-xs text-slate-400">
                  Use <code>scripts/build_docs_pack.mjs</code> with <code>readiness_bench/docs_sources/default_sources.json</code> to refresh from official docs.
                </p>
              </Card>
            </div>

            <Card className="space-y-3 bg-soft/50 p-4">
              <div className="space-y-1">
                <label htmlFor="runs-per-scenario" className="text-sm font-medium">
                  Runs per scenario
                </label>
                <select
                  id="runs-per-scenario"
                  value={runsPerScenario}
                  onChange={(event) => setRunsPerScenario(Number(event.target.value))}
                  className="w-full rounded-lg border border-white/15 bg-soft/70 px-3 py-2 text-sm"
                >
                  <option value={1}>1 (fast)</option>
                  <option value={2}>2 (stable)</option>
                  <option value={3}>3 (highest confidence)</option>
                </select>
              </div>
              <Button onClick={handleRun} disabled={running || effectiveModels.length < 2} className="w-full gap-2">
                <RefreshCw size={16} className={running ? "animate-spin" : ""} />
                {running ? "Running integrated benchmark..." : "Run Readiness Benchmark"}
              </Button>
              <p className="text-xs text-slate-300">{runSummary || "Run status will appear here."}</p>
            </Card>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="space-y-2 bg-soft/50 p-4">
              <div className="flex items-center gap-2 text-slate-300">
                <Gauge size={16} /> Leader Score
              </div>
              <p className="text-3xl font-semibold">{leader ? metricLabel(leader.overallScore) : "-"}</p>
            </Card>
            <Card className="space-y-2 bg-soft/50 p-4">
              <div className="flex items-center gap-2 text-slate-300">
                <Brain size={16} /> Decision Accuracy
              </div>
              <p className="text-3xl font-semibold">{leader ? metricLabel(leader.decisionAccuracyPct, "%") : "-"}</p>
            </Card>
            <Card className="space-y-2 bg-soft/50 p-4">
              <div className="flex items-center gap-2 text-slate-300">
                <ShieldCheck size={16} /> Workflow Success
              </div>
              <p className="text-3xl font-semibold">{leader ? metricLabel(leader.workflowSuccessRatePct, "%") : "-"}</p>
            </Card>
            <Card className="space-y-2 bg-soft/50 p-4">
              <div className="flex items-center gap-2 text-slate-300">
                <Timer size={16} /> P95 Total
              </div>
              <p className="text-3xl font-semibold">{leader ? metricLabel(leader.p95TotalLatencyMs, " ms") : "-"}</p>
            </Card>
          </div>

          <Disclosure title="Leaderboard table" subtitle="Per-model score components" defaultOpen>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-slate-300">
                  <tr>
                    <th className="px-2 py-2">Model</th>
                    <th className="px-2 py-2">Overall</th>
                    <th className="px-2 py-2">Decision Accuracy %</th>
                    <th className="px-2 py-2">Base Policy %</th>
                    <th className="px-2 py-2">Controls F1 %</th>
                    <th className="px-2 py-2">Parse Rate %</th>
                    <th className="px-2 py-2">Full Match %</th>
                    <th className="px-2 py-2">Docs Grounded %</th>
                    <th className="px-2 py-2">Source Coverage %</th>
                    <th className="px-2 py-2">Citation Validity %</th>
                    <th className="px-2 py-2">Workflow Success %</th>
                    <th className="px-2 py-2">Execution Eligibility %</th>
                    <th className="px-2 py-2">Avg Latency (ms)</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedModels.map((row) => (
                    <tr key={row.model} className="border-t border-white/10">
                      <td className="px-2 py-2">{row.model}</td>
                      <td className="px-2 py-2">{metricLabel(row.overallScore)}</td>
                      <td className="px-2 py-2">{metricLabel(row.decisionAccuracyPct)}</td>
                      <td className="px-2 py-2">{metricLabel(row.basePolicyAccuracyPct)}</td>
                      <td className="px-2 py-2">{metricLabel(row.controlsF1Pct)}</td>
                      <td className="px-2 py-2">{metricLabel(row.parseRatePct)}</td>
                      <td className="px-2 py-2">{metricLabel(row.fullMatchRatePct)}</td>
                      <td className="px-2 py-2">{metricLabel(row.docsGroundingRatePct)}</td>
                      <td className="px-2 py-2">{metricLabel(row.requiredSourceCoveragePct)}</td>
                      <td className="px-2 py-2">{metricLabel(row.citationValidityPct)}</td>
                      <td className="px-2 py-2">{metricLabel(row.workflowSuccessRatePct)}</td>
                      <td className="px-2 py-2">{metricLabel(row.executionEligibilityPct)}</td>
                      <td className="px-2 py-2">{metricLabel(row.avgTotalLatencyMs)}</td>
                    </tr>
                  ))}
                  {!sortedModels.length && !isLoading ? (
                    <tr>
                      <td className="px-2 py-3 text-slate-400" colSpan={13}>
                        No readiness benchmark results yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Disclosure>

          <Disclosure title="Scenario evidence matrix" subtitle="What each model did on each workflow scenario">
            <div className="space-y-4">
              {scenarioRows.map((row) => (
                <Card key={row.scenario.id} className="bg-soft/50 p-4">
                  <p className="text-sm font-semibold text-slate-100">{row.scenario.name}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Expected: decision {row.scenario.expected.decision}, approvalRequired {String(row.scenario.expected.approvalRequired)}, priority {row.scenario.expected.priority}, risk {row.scenario.expected.riskLevel}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Controls: {(row.scenario.expected.requiredControls ?? []).join(", ") || "none"} | Mode: {row.scenario.executionMode}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Required docs: {(row.scenario.requiredSources ?? []).join(", ") || "none"}
                  </p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-left text-xs">
                      <thead className="text-slate-300">
                        <tr>
                          <th className="px-2 py-2">Model</th>
                          <th className="px-2 py-2">Decision</th>
                          <th className="px-2 py-2">Accuracy %</th>
                          <th className="px-2 py-2">Docs grounded</th>
                          <th className="px-2 py-2">Citations</th>
                          <th className="px-2 py-2">Workflow status</th>
                          <th className="px-2 py-2">Top note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.byModel.map((entry) => (
                          <tr key={entry.model} className="border-t border-white/10 align-top">
                            <td className="px-2 py-2">{entry.model}</td>
                            <td className="px-2 py-2">
                              {entry.latest
                                ? `${entry.latest.llm.decision}, approval=${String(entry.latest.llm.approvalRequired)}, priority=${entry.latest.llm.priority}, risk=${entry.latest.llm.riskLevel}`
                                : "-"}
                            </td>
                            <td className="px-2 py-2">{entry.latest ? metricLabel(entry.latest.evaluation.accuracyPct) : "-"}</td>
                            <td className="px-2 py-2">{entry.latest ? (entry.latest.evaluation.docsGrounded ? "yes" : "no") : "-"}</td>
                            <td className="px-2 py-2 text-slate-300">
                              {entry.latest ? (entry.latest.llm.citations?.join(", ") || "-") : "-"}
                            </td>
                            <td className="px-2 py-2 uppercase">{entry.latest ? normalizeWorkflowStatus(entry.latest.workflow.status) : "-"}</td>
                            <td className="px-2 py-2 text-slate-300">
                              {entry.latest ? rowTopIssue(entry.latest.workflow.notes) : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ))}
              {!scenarioRows.length && !isLoading ? (
                <p className="text-sm text-slate-400">Run the readiness benchmark to populate scenario evidence.</p>
              ) : null}
            </div>
          </Disclosure>

          <Disclosure title="Setup and integration requirements" subtitle="What is missing and what to configure">
            <div className="space-y-4">
              {missingIntegrations.length > 0 ? (
                <div className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-4">
                  <div className="flex items-center gap-2 text-amber-100">
                    <AlertTriangle size={16} />
                    <p className="font-semibold">Some explicit integrations are not configured</p>
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    {missingIntegrations.map((item) => (
                      <div key={item.integration} className="rounded-lg border border-amber-200/20 bg-black/15 px-3 py-2">
                        <p className="font-medium text-amber-50">{item.integration}</p>
                        <p className="text-amber-50/90">Required: {item.required}</p>
                        <p className="text-amber-50/80">Reason: {item.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-emerald-200">All explicit integration settings are configured.</p>
              )}

              <Card className="bg-soft/50 p-4">
                <p className="mb-2 text-sm font-semibold">Environment snippet</p>
                <pre className="overflow-auto rounded-lg bg-black/25 p-3 text-[11px] leading-5 text-slate-100">{envSnippet}</pre>
              </Card>
            </div>
          </Disclosure>

          {runTechnicalLog ? (
            <Disclosure title="Technical logs" subtitle="Raw run output for debugging">
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-soft/60 p-3 text-[11px] leading-4 text-slate-200">
                {runTechnicalLog}
              </pre>
            </Disclosure>
          ) : null}
        </Card>
      </section>
    </main>
  );
}
