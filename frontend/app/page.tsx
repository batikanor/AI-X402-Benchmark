"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Gauge,
  ListChecks,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Timer,
  Workflow,
  XCircle,
} from "lucide-react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchReadinessDashboard, runReadinessBenchmark, type ReadinessDashboardResponse } from "@/lib/api";

type RuntimeMode = "ollama" | "openai_compat";
type ReadinessResult = ReadinessDashboardResponse["results"][number];

const HF_OPENAI_COMPAT_URL = "https://router.huggingface.co/v1";
const GEMMA4_VARIANTS = [
  {
    tag: "gemma4:e2b",
    label: "E2B (edge)",
    params: "2.3B effective (5.1B total)",
    className: "Phone/edge first",
  },
  {
    tag: "gemma4:e4b",
    label: "E4B (edge)",
    params: "4.5B effective (8.0B total)",
    className: "Phone + laptop friendly",
  },
  {
    tag: "gemma4:26b",
    label: "26B A4B (MoE)",
    params: "25.2B total (3.8B active)",
    className: "Workstation/GPU",
  },
  {
    tag: "gemma4:31b",
    label: "31B dense",
    params: "30.7B total",
    className: "High-end workstation",
  },
];
const MODEL_PRESETS = [
  {
    id: "phone",
    label: "Phone-size pack",
    models: ["qwen2.5:0.5b", "qwen3:4b-instruct", "gemma4:e2b", "gemma4:e4b"],
  },
  {
    id: "balanced",
    label: "Balanced pack",
    models: ["qwen3:4b-instruct", "gemma4:e4b", "gemma3:12b-it-qat", "phi4:14b"],
  },
  {
    id: "capacity",
    label: "Capacity pack",
    models: ["gemma4:26b", "gemma4:31b", "phi4:14b", "deepseek-r1:14b"],
  },
];

function metricLabel(value: number | undefined, suffix = ""): string {
  if (value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return `${value.toFixed(2)}${suffix}`;
}

function paramsLabel(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value % 1 === 0 ? `${value.toFixed(0)}B` : `${value.toFixed(1)}B`;
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
    <details open={defaultOpen} className="group rounded-2xl border border-white/10 bg-soft/35 p-4 backdrop-blur-sm">
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

function toneForRate(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "text-slate-200";
  if (value >= 85) return "text-emerald-300";
  if (value >= 60) return "text-amber-200";
  return "text-rose-300";
}

type HumanTask = {
  label: string;
  passed: boolean;
  detail: string;
};

function passLabel(value: boolean): string {
  return value ? "pass" : "fail";
}

function joinList(values: string[] | undefined): string {
  const clean = (values ?? []).map((item) => String(item || "").trim()).filter(Boolean);
  return clean.length ? clean.join(", ") : "none";
}

function buildHumanTaskChecklist(result: ReadinessResult): HumanTask[] {
  const expectedControls = result.expected.requiredControls ?? [];
  const modelControls = result.llm.requiredControls ?? [];
  const workflowStatus = normalizeWorkflowStatus(result.workflow.status);
  const workflowSucceeded = workflowStatus === "success";

  const workflowTask: HumanTask =
    result.executionMode === "decision_only"
      ? {
          label: "Run execution path",
          passed: true,
          detail: "Case is configured as decision_only, so onchain execution is intentionally skipped.",
        }
      : {
          label: "Run execution path",
          passed: workflowSucceeded,
          detail: workflowSucceeded
            ? `Workflow succeeded in ${metricLabel(result.workflow.durationMs)} ms.`
            : `Workflow status: ${workflowStatus}. ${rowTopIssue(result.workflow.notes ?? [])}`,
        };

  return [
    {
      label: "Return parseable structured output",
      passed: Boolean(result.llm.parseOk),
      detail: result.llm.parseOk
        ? "Model output parsed successfully."
        : result.llm.error || "Output parser could not read a valid response payload.",
    },
    {
      label: "Choose the correct decision (allow/block)",
      passed: Boolean(result.evaluation.decisionMatch),
      detail: `Expected ${result.expected.decision}; model returned ${result.llm.decision || "unknown"}.`,
    },
    {
      label: "Set approval requirement correctly",
      passed: Boolean(result.evaluation.approvalMatch),
      detail: `Expected ${String(result.expected.approvalRequired)}; model returned ${String(result.llm.approvalRequired)}.`,
    },
    {
      label: "Set priority correctly",
      passed: Boolean(result.evaluation.priorityMatch),
      detail: `Expected ${result.expected.priority}; model returned ${result.llm.priority || "unknown"}.`,
    },
    {
      label: "Set risk level correctly",
      passed: Boolean(result.evaluation.riskMatch),
      detail: `Expected ${result.expected.riskLevel}; model returned ${result.llm.riskLevel || "unknown"}.`,
    },
    {
      label: "Select required controls",
      passed: (result.evaluation.controlsF1Pct ?? 0) >= 99.9,
      detail: `Expected: ${joinList(expectedControls)} | Returned: ${joinList(modelControls)} | Controls F1 ${metricLabel(result.evaluation.controlsF1Pct)}%.`,
    },
    {
      label: "Ground answer in required docs",
      passed: Boolean(result.evaluation.docsGrounded),
      detail: `Required sources hit: ${joinList(result.evaluation.requiredSourceHits ?? [])}. Coverage ${metricLabel(result.evaluation.requiredSourceCoveragePct)}%.`,
    },
    {
      label: "Provide valid citations",
      passed: (result.evaluation.citationValidityPct ?? 0) >= 90,
      detail: `${result.evaluation.validCitationCount ?? 0}/${result.evaluation.citationCount ?? 0} citations valid (${metricLabel(result.evaluation.citationValidityPct)}%).`,
    },
    {
      label: "Be eligible for execution",
      passed: Boolean(result.evaluation.executionEligible),
      detail: result.evaluation.executionEligible
        ? "Decision matched policy gates and execution path was allowed."
        : "Decision/gating mismatch made this case non-executable.",
    },
    workflowTask,
  ];
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
  const modelParamsByName = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const row of data?.models ?? []) {
      map.set(row.model, row.paramsBillions ?? null);
    }
    return map;
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

  const taskAuditRows = useMemo(() => {
    const results = data?.results ?? [];
    const latestByModelCase = new Map<string, ReadinessResult>();
    for (const item of results) {
      const key = `${item.model}::${item.caseId}`;
      const previous = latestByModelCase.get(key);
      if (!previous || item.attempt > previous.attempt) {
        latestByModelCase.set(key, item);
      }
    }

    return Array.from(latestByModelCase.values()).sort((a, b) => {
      if (a.model !== b.model) return a.model.localeCompare(b.model);
      if (a.caseName !== b.caseName) return a.caseName.localeCompare(b.caseName);
      return a.attempt - b.attempt;
    });
  }, [data?.results]);

  const effectiveModels = useMemo(() => {
    const parsed = parseModelCsv(customModels);
    if (parsed.length) return parsed;
    return selectedModels;
  }, [customModels, selectedModels]);
  const integrationsReady = data?.track.integrationStatus?.isFullyConfigured ?? false;
  const runStatusTone = integrationsReady ? "text-emerald-200" : "text-amber-200";
  const runStatusLabel = integrationsReady ? "Integrations ready for explicit external endpoints." : "Using local integration fallbacks for missing explicit endpoints.";

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

  function applyModelPreset(models: string[], label: string) {
    const available = data?.availableModels ?? [];
    const eligible = models.filter((item) => available.includes(item)).slice(0, 8);
    if (eligible.length < 2) {
      setRunSummary(
        `Preset "${label}" needs at least 2 installed models. Install missing models and try again.`,
      );
      return;
    }
    setCustomModels("");
    setSelectedModels(eligible);
    setRunSummary(`Preset "${label}" loaded with models: ${eligible.join(", ")}.`);
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
            `Readiness run completed. Leader ${topModel.model} (${paramsLabel(topModel.paramsBillions)}) with score ${metricLabel(topModel.overallScore)}. Decision accuracy ${metricLabel(topModel.decisionAccuracyPct, "%")}, docs grounded ${metricLabel(topModel.docsGroundingRatePct, "%")}, workflow success ${metricLabel(topModel.workflowSuccessRatePct, "%")}. Run ID ${updated.latest.runId}.`,
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
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8">
      <section className="mb-6">
        <Card className="relative overflow-hidden border-cyan-300/20 bg-gradient-to-br from-[#111a33]/95 via-[#0f1930]/95 to-[#122347]/95 p-6 md:p-8">
          <div className="pointer-events-none absolute -right-12 -top-14 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-8 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="relative z-10 flex flex-wrap items-start justify-between gap-5">
            <div className="space-y-3">
              <Badge className="gap-1 border-cyan-300/35 bg-cyan-300/10 text-cyan-100">
                <Sparkles size={12} />
                Cannes Final Build
              </Badge>
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">x402Bench LLM Readiness</h1>
              <p className="max-w-4xl text-sm text-slate-200 md:text-[15px]">
                A single integrated benchmark for judging-ready demos: model decision quality, documentation-grounded policy correctness, and workflow execution reliability in one scoreboard.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {(data?.project.sponsors ?? ["Hedera", "Chainlink", "Ledger"]).map((sponsor) => (
                  <Badge key={sponsor} className="border-white/25 bg-white/10 text-white">
                    {sponsor}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-black/20 p-4 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Latest Run</p>
              <p className="mt-1 truncate text-sm font-medium text-slate-100">{data?.latest?.runId ?? "No run yet"}</p>
              <p className="mt-1 text-xs text-slate-400">{formatDateTime(data?.latest?.finishedAt)}</p>
              <p className={`mt-3 text-xs ${runStatusTone}`}>{runStatusLabel}</p>
            </div>
          </div>
          <div className="relative z-10 mt-6 grid gap-3 md:grid-cols-2">
            <Card className="border-fuchsia-300/20 bg-fuchsia-500/10 p-4">
              <div className="mb-2 flex items-center gap-2 text-fuchsia-100">
                <Brain size={16} />
                <p className="font-semibold">Dimension A: Decision Quality</p>
              </div>
              <p className="text-sm text-slate-200">
                Measures structured decision correctness: allow/block, approval gate, priority, risk level, control selection, and documentation grounding.
              </p>
            </Card>
            <Card className="border-cyan-300/20 bg-cyan-500/10 p-4">
              <div className="mb-2 flex items-center gap-2 text-cyan-100">
                <Workflow size={16} />
                <p className="font-semibold">Dimension B: Execution Reliability</p>
              </div>
              <p className="text-sm text-slate-200">
                Runs eligible scenarios through Chainlink orchestration, Hedera settlement, and Ledger checks, then scores reliability and latency.
              </p>
            </Card>
          </div>
        </Card>
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

              <Card className="space-y-3 bg-soft/50 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                  <Cpu size={15} />
                  Quick model presets
                </div>
                <div className="flex flex-wrap gap-2">
                  {MODEL_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyModelPreset(preset.models, preset.label)}
                      className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-cyan-200/50 hover:bg-cyan-300/10"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400">
                  Presets select only currently installed models. Install missing models to unlock full packs.
                </p>
              </Card>

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
                      <span className="truncate pr-2">
                        {model}
                        <span className="ml-2 text-xs text-slate-400">
                          {paramsLabel(modelParamsByName.get(model))}
                        </span>
                      </span>
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

              <Card className="space-y-3 bg-soft/50 p-4">
                <p className="text-sm font-medium">Gemma 4 variants (latest official)</p>
                <p className="text-xs text-slate-400">
                  Use edge variants when you want a phone-capable comparison baseline.
                </p>
                <div className="overflow-x-auto">
                  <table className="data-table min-w-full text-left text-xs">
                    <thead className="text-slate-300">
                      <tr>
                        <th className="px-2 py-2">Tag</th>
                        <th className="px-2 py-2">Variant</th>
                        <th className="px-2 py-2">Parameters</th>
                        <th className="px-2 py-2">Fit class</th>
                        <th className="px-2 py-2">Installed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {GEMMA4_VARIANTS.map((variant) => (
                        <tr key={variant.tag} className="border-t border-white/10">
                          <td className="px-2 py-2 font-mono text-[11px]">{variant.tag}</td>
                          <td className="px-2 py-2">{variant.label}</td>
                          <td className="px-2 py-2">{variant.params}</td>
                          <td className="px-2 py-2">{variant.className}</td>
                          <td className="px-2 py-2">
                            {data?.availableModels.includes(variant.tag) ? "yes" : "no"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-500">
                  Install missing tags with <code>ollama pull gemma4:&lt;tag&gt;</code> (for example <code>ollama pull gemma4:e2b</code>).
                </p>
              </Card>

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

            <Card className="space-y-4 border-cyan-200/20 bg-gradient-to-br from-cyan-300/10 to-emerald-300/10 p-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-100">Run Panel</p>
                <p className="text-xs text-slate-300">Launch one full benchmark run across all selected models and scenarios.</p>
              </div>
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
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-[11px] uppercase tracking-[0.1em] text-slate-400">Run status</p>
                <p className="mt-1 text-xs text-slate-200">{runSummary || "Run status will appear here."}</p>
              </div>
              <div className="space-y-1 text-xs text-slate-300">
                <p>Readiness checklist</p>
                <p>- Minimum 2 models selected</p>
                <p>- Docs grounding configured</p>
                <p>- Integrations reachable (explicit or local fallback)</p>
              </div>
            </Card>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="space-y-2 border-cyan-200/20 bg-soft/50 p-4">
              <div className="flex items-center gap-2 text-slate-300">
                <Gauge size={16} /> Leader Score
              </div>
              <p className={`text-3xl font-semibold ${toneForRate(leader?.overallScore)}`}>{leader ? metricLabel(leader.overallScore) : "-"}</p>
              <p className="text-xs text-slate-400">{leader ? leader.model : "No run data yet"}</p>
            </Card>
            <Card className="space-y-2 border-fuchsia-200/20 bg-soft/50 p-4">
              <div className="flex items-center gap-2 text-slate-300">
                <Brain size={16} /> Decision Accuracy
              </div>
              <p className={`text-3xl font-semibold ${toneForRate(leader?.decisionAccuracyPct)}`}>{leader ? metricLabel(leader.decisionAccuracyPct, "%") : "-"}</p>
              <p className="text-xs text-slate-400">Policy, priority, risk, controls, docs.</p>
            </Card>
            <Card className="space-y-2 border-emerald-200/20 bg-soft/50 p-4">
              <div className="flex items-center gap-2 text-slate-300">
                <ShieldCheck size={16} /> Workflow Success
              </div>
              <p className={`text-3xl font-semibold ${toneForRate(leader?.workflowSuccessRatePct)}`}>{leader ? metricLabel(leader.workflowSuccessRatePct, "%") : "-"}</p>
              <p className="text-xs text-slate-400">Only eligible cases attempt execution.</p>
            </Card>
            <Card className="space-y-2 border-sky-200/20 bg-soft/50 p-4">
              <div className="flex items-center gap-2 text-slate-300">
                <Timer size={16} /> P95 Total
              </div>
              <p className="text-3xl font-semibold">{leader ? metricLabel(leader.p95TotalLatencyMs, " ms") : "-"}</p>
              <p className="text-xs text-slate-400">End-to-end benchmark latency at p95.</p>
            </Card>
          </div>

          <Disclosure title="Leaderboard table" subtitle="Per-model score components" defaultOpen>
            <div className="overflow-x-auto">
              <table className="data-table min-w-full text-left text-sm">
                <thead className="text-slate-300">
                  <tr>
                    <th className="px-2 py-2">Model</th>
                    <th className="px-2 py-2">Params (B)</th>
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
                      <td className="px-2 py-2">{paramsLabel(row.paramsBillions)}</td>
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
                      <td className="px-2 py-3 text-slate-400" colSpan={14}>
                        No readiness benchmark results yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Disclosure>

          <Disclosure title="Task Definitions" subtitle="Human-readable checks scored on every run">
            <div className="grid gap-2 text-sm text-slate-200 md:grid-cols-2">
              <Card className="flex items-start gap-2 bg-black/20 p-3">
                <ListChecks size={15} className="mt-0.5 text-cyan-200" />
                <p>Return parseable structured output.</p>
              </Card>
              <Card className="flex items-start gap-2 bg-black/20 p-3">
                <ListChecks size={15} className="mt-0.5 text-cyan-200" />
                <p>Choose correct allow/block decision.</p>
              </Card>
              <Card className="flex items-start gap-2 bg-black/20 p-3">
                <ListChecks size={15} className="mt-0.5 text-cyan-200" />
                <p>Set approval requirement correctly.</p>
              </Card>
              <Card className="flex items-start gap-2 bg-black/20 p-3">
                <ListChecks size={15} className="mt-0.5 text-cyan-200" />
                <p>Set priority correctly.</p>
              </Card>
              <Card className="flex items-start gap-2 bg-black/20 p-3">
                <ListChecks size={15} className="mt-0.5 text-cyan-200" />
                <p>Set risk level correctly.</p>
              </Card>
              <Card className="flex items-start gap-2 bg-black/20 p-3">
                <ListChecks size={15} className="mt-0.5 text-cyan-200" />
                <p>Select required controls.</p>
              </Card>
              <Card className="flex items-start gap-2 bg-black/20 p-3">
                <ListChecks size={15} className="mt-0.5 text-cyan-200" />
                <p>Ground answer in required official docs.</p>
              </Card>
              <Card className="flex items-start gap-2 bg-black/20 p-3">
                <ListChecks size={15} className="mt-0.5 text-cyan-200" />
                <p>Provide valid citations.</p>
              </Card>
              <Card className="flex items-start gap-2 bg-black/20 p-3">
                <ListChecks size={15} className="mt-0.5 text-cyan-200" />
                <p>Pass execution-eligibility gates.</p>
              </Card>
              <Card className="flex items-start gap-2 bg-black/20 p-3">
                <ListChecks size={15} className="mt-0.5 text-cyan-200" />
                <p>Complete execution path (or pass as decision-only case).</p>
              </Card>
            </div>
          </Disclosure>

          <Disclosure title="Run Task Audit (Human-Readable)" subtitle="Latest attempt per model and scenario">
            <div className="space-y-4">
              {taskAuditRows.map((row) => {
                const checklist = buildHumanTaskChecklist(row);
                const passedCount = checklist.filter((item) => item.passed).length;
                return (
                  <Card key={`${row.model}-${row.caseId}`} className="border-white/15 bg-soft/55 p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                      <Badge className="border-white/20 bg-white/10 text-white">{row.model}</Badge>
                      <Badge className="border-white/20 bg-white/5 text-white">{row.caseName}</Badge>
                      <Badge className="border-white/20 bg-white/5 text-white">attempt {row.attempt}</Badge>
                      <Badge className="border-white/20 bg-white/5 text-white">
                        tasks passed: {passedCount}/{checklist.length}
                      </Badge>
                      <Badge className="border-white/20 bg-white/5 text-white">
                        total latency: {metricLabel(row.totalLatencyMs)} ms
                      </Badge>
                    </div>
                    <div className="space-y-2 text-sm">
                      {checklist.map((task) => (
                        <div
                          key={task.label}
                          className={`rounded-lg border px-3 py-2 ${
                            task.passed ? "border-emerald-300/25 bg-emerald-300/10" : "border-rose-300/25 bg-rose-300/10"
                          }`}
                        >
                          <p className="flex items-center gap-2 font-medium text-slate-100">
                            {task.passed ? <CheckCircle2 size={14} className="text-emerald-200" /> : <XCircle size={14} className="text-rose-200" />}
                            {task.label}: {passLabel(task.passed)}
                          </p>
                          <p className="mt-1 text-xs text-slate-100/90">{task.detail}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-slate-400">
                      <p>Model reason: {row.llm.reason || "no reason text"}</p>
                      <p>Citation IDs: {joinList(row.llm.citations ?? [])}</p>
                      <p>Raw output preview: {row.llm.rawOutputPreview || "n/a"}</p>
                    </div>
                  </Card>
                );
              })}
              {!taskAuditRows.length && !isLoading ? (
                <p className="text-sm text-slate-400">Run the readiness benchmark to generate task-by-task audit rows.</p>
              ) : null}
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
                    <table className="data-table min-w-full text-left text-xs">
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
