"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Gauge,
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
type SponsorKey = "Hedera" | "Chainlink" | "Ledger";
type ReadinessResult = ReadinessDashboardResponse["results"][number];
type ReadinessScenario = ReadinessDashboardResponse["scenarios"][number];

const HF_OPENAI_COMPAT_URL = "https://router.huggingface.co/v1";
const SPONSORS: SponsorKey[] = ["Hedera", "Chainlink", "Ledger"];

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

type DisclosureProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
};

type MissingIntegration = {
  integration: string;
  mode?: string;
  reason: string;
  required: string;
};

type HumanTask = {
  label: string;
  passed: boolean;
  detail: string;
};

type SponsorAggregate = {
  sponsor: SponsorKey;
  cases: number;
  decisionAccuracyPct: number;
  docsGroundedPct: number;
  executionSignalPct: number;
  sponsorScore: number;
};

function Disclosure({ title, subtitle, children, defaultOpen = false }: DisclosureProps) {
  return (
    <details open={defaultOpen} className="group rounded-2xl border border-white/10 bg-soft/40 p-4 backdrop-blur-sm">
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

function metricLabel(value: number | undefined, suffix = ""): string {
  if (value === undefined || Number.isNaN(value)) return "-";
  return `${value.toFixed(2)}${suffix}`;
}

function paramsLabel(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value % 1 === 0 ? `${value.toFixed(0)}B` : `${value.toFixed(1)}B`;
}

function formatDateTime(value: string | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function compactLog(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 5000) return trimmed;
  return `${trimmed.slice(0, 5000)}\n...[truncated]`;
}

function parseModelCsv(value: string): string[] {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(items)).slice(0, 8);
}

function normalizeWorkflowStatus(status: string | undefined): string {
  const value = String(status || "").toLowerCase();
  if (value === "success") return "success";
  if (value.includes("failed")) return "failed";
  if (value.includes("blocked")) return "blocked";
  if (value.includes("mismatch")) return "decision mismatch";
  if (value === "skipped") return "skipped";
  return value || "unknown";
}

function joinList(values: string[] | undefined): string {
  const clean = (values ?? []).map((item) => String(item || "").trim()).filter(Boolean);
  return clean.length ? clean.join(", ") : "none";
}

function rowTopIssue(notes: string[]): string {
  if (!notes.length) return "No note";
  return notes[0];
}

function toneForRate(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "text-slate-200";
  if (value >= 85) return "text-emerald-300";
  if (value >= 60) return "text-amber-200";
  return "text-rose-300";
}

function statusChipTone(status: string | undefined): string {
  const normalized = normalizeWorkflowStatus(status);
  if (normalized === "success") return "border-emerald-300/30 bg-emerald-300/10 text-emerald-200";
  if (normalized === "failed") return "border-rose-300/30 bg-rose-300/10 text-rose-200";
  if (normalized === "blocked" || normalized === "decision mismatch") return "border-amber-300/30 bg-amber-300/10 text-amber-200";
  return "border-white/20 bg-white/10 text-slate-200";
}

function passLabel(value: boolean): string {
  return value ? "pass" : "fail";
}

function caseSponsors(caseDef: ReadinessScenario | undefined, fallbackExecutionMode: string): SponsorKey[] {
  const rawSources = caseDef?.requiredSources ?? [];
  const sourceIds = rawSources.map((id) => String(id || "").toLowerCase());
  const set = new Set<SponsorKey>();

  if (sourceIds.some((id) => id.includes("hedera"))) set.add("Hedera");
  if (sourceIds.some((id) => id.includes("chainlink"))) set.add("Chainlink");
  if (sourceIds.some((id) => id.includes("ledger") || id.includes("eip-712") || id.includes("eip-7730"))) {
    set.add("Ledger");
  }

  // Real execution cases touch all three integrations in this benchmark architecture.
  const executionMode = String(caseDef?.executionMode || fallbackExecutionMode || "").toLowerCase();
  if (executionMode === "real") {
    set.add("Hedera");
    set.add("Chainlink");
    set.add("Ledger");
  }

  if (!set.size) {
    set.add("Hedera");
    set.add("Chainlink");
    set.add("Ledger");
  }

  return Array.from(set);
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
          detail: "Case is decision-only, so execution is intentionally skipped.",
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
      detail: result.llm.parseOk ? "Model output parsed successfully." : result.llm.error || "Could not parse valid JSON response.",
    },
    {
      label: "Choose correct allow/block decision",
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
      label: "Pass execution eligibility gate",
      passed: Boolean(result.evaluation.executionEligible),
      detail: result.evaluation.executionEligible
        ? "Decision satisfied policy checks and became executable."
        : "Decision mismatch blocked execution path.",
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
  const [activeModel, setActiveModel] = useState("");

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

  useEffect(() => {
    if (!sortedModels.length) {
      setActiveModel("");
      return;
    }
    if (!activeModel || !sortedModels.some((row) => row.model === activeModel)) {
      setActiveModel(sortedModels[0].model);
    }
  }, [sortedModels, activeModel]);

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
        required: status.hedera.mode === "sdk" ? "HEDERA_OPERATOR_ID + HEDERA_OPERATOR_KEY" : "HEDERA_RELAY_URL",
      });
    }
    if (!status.chainlink.configured) {
      missing.push({
        integration: "Chainlink",
        mode: status.chainlink.mode,
        reason: status.chainlink.reason,
        required: status.chainlink.mode === "cli" ? "CHAINLINK_MODE=cli" : "CHAINLINK_WEBHOOK_URL",
      });
    }
    if (!status.ledger.configured) {
      missing.push({
        integration: "Ledger",
        mode: status.ledger.mode,
        reason: status.ledger.reason,
        required: status.ledger.mode === "ledger_hw" ? "LEDGER_MODE=ledger_hw" : "LEDGER_APPROVER_URL",
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

  const effectiveModels = useMemo(() => {
    const parsed = parseModelCsv(customModels);
    if (parsed.length) return parsed;
    return selectedModels;
  }, [customModels, selectedModels]);

  const latestResultRows = useMemo(() => {
    const results = data?.results ?? [];
    const latestByModelCase = new Map<string, ReadinessResult>();
    for (const item of results) {
      const key = `${item.model}::${item.caseId}`;
      const previous = latestByModelCase.get(key);
      if (!previous || item.attempt > previous.attempt) {
        latestByModelCase.set(key, item);
      }
    }
    return Array.from(latestByModelCase.values());
  }, [data?.results]);

  const scenarioById = useMemo(() => {
    const map = new Map<string, ReadinessScenario>();
    for (const scenario of data?.scenarios ?? []) {
      map.set(scenario.id, scenario);
    }
    return map;
  }, [data?.scenarios]);

  const sponsorBreakdownByModel = useMemo(() => {
    const byModel = new Map<string, SponsorAggregate[]>();

    for (const modelRow of sortedModels) {
      const modelRows = latestResultRows.filter((row) => row.model === modelRow.model);
      const sponsorRows: SponsorAggregate[] = [];

      for (const sponsor of SPONSORS) {
        const scoped = modelRows.filter((row) => {
          const scenario = scenarioById.get(row.caseId) || scenarioById.get(row.scenarioId);
          return caseSponsors(scenario, row.executionMode).includes(sponsor);
        });

        if (!scoped.length) {
          sponsorRows.push({
            sponsor,
            cases: 0,
            decisionAccuracyPct: 0,
            docsGroundedPct: 0,
            executionSignalPct: 0,
            sponsorScore: 0,
          });
          continue;
        }

        const decisionAccuracyPct = scoped.reduce((acc, row) => acc + (row.evaluation.accuracyPct ?? 0), 0) / scoped.length;
        const docsGroundedPct =
          (scoped.filter((row) => row.evaluation.docsGrounded).length / scoped.length) * 100;

        const executed = scoped.filter((row) => row.workflow.executed);
        const executionSignalPct = executed.length
          ? (executed.filter((row) => normalizeWorkflowStatus(row.workflow.status) === "success").length / executed.length) * 100
          : (scoped.reduce((acc, row) => acc + (row.evaluation.executionEligible ? 100 : 0), 0) / scoped.length);

        const sponsorScore =
          decisionAccuracyPct * 0.5 +
          docsGroundedPct * 0.3 +
          executionSignalPct * 0.2;

        sponsorRows.push({
          sponsor,
          cases: scoped.length,
          decisionAccuracyPct,
          docsGroundedPct,
          executionSignalPct,
          sponsorScore,
        });
      }

      byModel.set(modelRow.model, sponsorRows);
    }

    return byModel;
  }, [sortedModels, latestResultRows, scenarioById]);

  const activeModelRow = useMemo(
    () => sortedModels.find((row) => row.model === activeModel) ?? null,
    [sortedModels, activeModel],
  );

  const activeModelSponsorRows = useMemo(
    () => sponsorBreakdownByModel.get(activeModel ?? "") ?? [],
    [sponsorBreakdownByModel, activeModel],
  );

  const activeModelCaseRows = useMemo(() => {
    return latestResultRows
      .filter((row) => row.model === activeModel)
      .sort((a, b) => a.caseName.localeCompare(b.caseName));
  }, [latestResultRows, activeModel]);

  const integrationsReady = data?.track.integrationStatus?.isFullyConfigured ?? false;
  const runStatusTone = integrationsReady ? "text-emerald-200" : "text-amber-200";
  const runStatusLabel = integrationsReady
    ? "Explicit integration endpoints are configured."
    : "Using local integration fallbacks where explicit endpoints are missing.";

  function toggleModelSelection(model: string) {
    setSelectedModels((previous) => {
      if (previous.includes(model)) return previous.filter((item) => item !== model);
      if (previous.length >= 8) return previous;
      return [...previous, model];
    });
  }

  function applyModelPreset(models: string[], label: string) {
    const available = data?.availableModels ?? [];
    const eligible = models.filter((item) => available.includes(item)).slice(0, 8);
    if (eligible.length < 2) {
      setRunSummary(`Preset "${label}" needs at least 2 installed models. Install missing models and retry.`);
      return;
    }
    setCustomModels("");
    setSelectedModels(eligible);
    setRunSummary(`Preset "${label}" loaded: ${eligible.join(", ")}.`);
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
            `Run completed. Leader ${topModel.model} (${paramsLabel(topModel.paramsBillions)}) | Score ${metricLabel(topModel.overallScore)} | Decision ${metricLabel(topModel.decisionAccuracyPct, "%")} | Workflow ${metricLabel(topModel.workflowSuccessRatePct, "%")} | Run ${updated.latest.runId}.`,
          );
        } else {
          setRunSummary("Run completed. Dashboard is refreshing.");
        }
      } else {
        setRunSummary(`Run not completed (code ${result.returnCode}). Open Technical logs.`);
      }
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : String(runError);
      setRunSummary(`Run failed: ${message}`);
      setRunTechnicalLog(compactLog(message));
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8">
      <section className="mb-6">
        <Card className="relative overflow-hidden border-[#2bb89a]/20 bg-gradient-to-br from-[#0a2d28]/95 via-[#062823]/95 to-[#041d1a]/95 p-6 md:p-8">
          <div className="pointer-events-none absolute -right-12 -top-14 h-56 w-56 rounded-full bg-[#23c19f]/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-8 h-56 w-56 rounded-full bg-[#1a7f6b]/15 blur-3xl" />
          <div className="relative z-10 flex flex-wrap items-start justify-between gap-5">
            <div className="space-y-3">
              <Badge className="gap-1 border-[#35cda7]/35 bg-[#35cda7]/10 text-[#97f2dc]">
                <Sparkles size={12} />
                Final Presentation UI
              </Badge>
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">x402Bench LLM Readiness</h1>
              <p className="max-w-4xl text-sm text-slate-200 md:text-[15px]">
                One integrated benchmark with two levels of reading: a global leaderboard for fast ranking, and one-click model deep dives for detailed judging.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {(data?.project.sponsors ?? SPONSORS).map((sponsor) => (
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

              <Card className="space-y-3 border-[#2fc7a3]/20 bg-soft/55 p-4">
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
                      className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-[#3ce2bb]/50 hover:bg-[#3ce2bb]/10"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400">Presets only apply installed models.</p>
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
                        checked ? "border-[#2fc7a3] bg-[#2fc7a3]/12" : "border-white/15 bg-soft/60"
                      }`}
                    >
                      <span className="truncate pr-2">
                        {model}
                        <span className="ml-2 text-xs text-slate-400">{paramsLabel(modelParamsByName.get(model))}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        {recommended ? <Badge className="border-white/20 bg-white/10 text-white">recommended</Badge> : null}
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleModelSelection(model)}
                          className="h-4 w-4 accent-[#2fc7a3]"
                        />
                      </span>
                    </label>
                  );
                })}
              </div>
              {!data?.availableModels.length && !isLoading && runtime === "ollama" ? (
                <p className="text-xs text-amber-200">No Ollama models detected. Install at least 2 text models first.</p>
              ) : null}

              <Card className="space-y-3 bg-soft/55 p-4">
                <p className="text-sm font-medium">Gemma 4 variants (latest official)</p>
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
                          <td className="px-2 py-2">{data?.availableModels.includes(variant.tag) ? "yes" : "no"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="space-y-2 bg-soft/55 p-4">
                <label htmlFor="custom-models" className="text-sm font-medium">
                  Custom model list (comma-separated)
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
                <Card className="space-y-3 bg-soft/55 p-4">
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
                </Card>
              ) : null}

              <Card className="space-y-3 bg-soft/55 p-4">
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
                    className="h-4 w-4 accent-[#2fc7a3]"
                  />
                  Require citation coverage for passing
                </label>
              </Card>
            </div>

            <Card className="space-y-4 border-[#2fc7a3]/20 bg-gradient-to-br from-[#1a3b35]/45 to-[#10312b]/40 p-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-100">Run Panel</p>
                <p className="text-xs text-slate-300">Launch one integrated benchmark run.</p>
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
                {running ? "Running benchmark..." : "Run Readiness Benchmark"}
              </Button>

              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-[11px] uppercase tracking-[0.1em] text-slate-400">Run status</p>
                <p className="mt-1 text-xs text-slate-200">{runSummary || "Run status will appear here."}</p>
              </div>

              <div className="space-y-2 text-xs text-slate-300">
                <p className="font-semibold">Current benchmark coverage</p>
                <p>Mocked: {data?.track.mocked === false ? "No" : "Unknown"}</p>
                <p>Cases: {data?.track.scenarioCount ?? "-"}</p>
                <p>Docs grounding: {data?.track.docs?.enabled ? "On" : "Off"}</p>
                <p>Integrations ready: {data?.track.integrationStatus?.isFullyConfigured ? "Yes" : "Partial"}</p>
              </div>
            </Card>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="space-y-2 border-[#46d7b6]/20 bg-soft/55 p-4">
              <div className="flex items-center gap-2 text-slate-300">
                <Gauge size={16} /> Leader Score
              </div>
              <p className={`text-3xl font-semibold ${toneForRate(leader?.overallScore)}`}>{leader ? metricLabel(leader.overallScore) : "-"}</p>
              <p className="text-xs text-slate-400">{leader ? leader.model : "No run data yet"}</p>
            </Card>
            <Card className="space-y-2 border-[#2fc7a3]/20 bg-soft/55 p-4">
              <div className="flex items-center gap-2 text-slate-300">
                <Brain size={16} /> Decision Accuracy
              </div>
              <p className={`text-3xl font-semibold ${toneForRate(leader?.decisionAccuracyPct)}`}>
                {leader ? metricLabel(leader.decisionAccuracyPct, "%") : "-"}
              </p>
              <p className="text-xs text-slate-400">Policy, controls, and documentation correctness.</p>
            </Card>
            <Card className="space-y-2 border-[#3ab798]/20 bg-soft/55 p-4">
              <div className="flex items-center gap-2 text-slate-300">
                <ShieldCheck size={16} /> Workflow Success
              </div>
              <p className={`text-3xl font-semibold ${toneForRate(leader?.workflowSuccessRatePct)}`}>
                {leader ? metricLabel(leader.workflowSuccessRatePct, "%") : "-"}
              </p>
              <p className="text-xs text-slate-400">Only eligible cases attempt execution.</p>
            </Card>
            <Card className="space-y-2 border-[#2b9980]/20 bg-soft/55 p-4">
              <div className="flex items-center gap-2 text-slate-300">
                <Timer size={16} /> P95 Total
              </div>
              <p className="text-3xl font-semibold">{leader ? metricLabel(leader.p95TotalLatencyMs, " ms") : "-"}</p>
              <p className="text-xs text-slate-400">End-to-end p95 latency.</p>
            </Card>
          </div>

          <Disclosure title="General Leaderboard" subtitle="Global performance across all scored dimensions" defaultOpen>
            <div className="overflow-x-auto">
              <table className="data-table min-w-full text-left text-sm">
                <thead className="text-slate-300">
                  <tr>
                    <th className="px-2 py-2">Model</th>
                    <th className="px-2 py-2">Params (B)</th>
                    <th className="px-2 py-2">Overall</th>
                    <th className="px-2 py-2">Decision %</th>
                    <th className="px-2 py-2">Full Match %</th>
                    <th className="px-2 py-2">Docs Grounded %</th>
                    <th className="px-2 py-2">Workflow Success %</th>
                    <th className="px-2 py-2">Exec Eligibility %</th>
                    <th className="px-2 py-2">Avg Latency (ms)</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedModels.map((row) => (
                    <tr key={row.model} className="border-t border-white/10">
                      <td className="px-2 py-2 font-medium">{row.model}</td>
                      <td className="px-2 py-2">{paramsLabel(row.paramsBillions)}</td>
                      <td className="px-2 py-2">{metricLabel(row.overallScore)}</td>
                      <td className="px-2 py-2">{metricLabel(row.decisionAccuracyPct)}</td>
                      <td className="px-2 py-2">{metricLabel(row.fullMatchRatePct)}</td>
                      <td className="px-2 py-2">{metricLabel(row.docsGroundingRatePct)}</td>
                      <td className="px-2 py-2">{metricLabel(row.workflowSuccessRatePct)}</td>
                      <td className="px-2 py-2">{metricLabel(row.executionEligibilityPct)}</td>
                      <td className="px-2 py-2">{metricLabel(row.avgTotalLatencyMs)}</td>
                    </tr>
                  ))}
                  {!sortedModels.length && !isLoading ? (
                    <tr>
                      <td className="px-2 py-3 text-slate-400" colSpan={9}>
                        No readiness benchmark results yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Disclosure>

          <Disclosure title="Sponsor Breakdown" subtitle="Per-sponsor quality and execution signal by model" defaultOpen>
            <div className="space-y-4">
              {sortedModels.map((modelRow) => {
                const rows = sponsorBreakdownByModel.get(modelRow.model) ?? [];
                return (
                  <Card key={modelRow.model} className="bg-soft/55 p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge className="border-white/20 bg-white/10 text-white">{modelRow.model}</Badge>
                      <Badge className="border-white/20 bg-white/5 text-white">overall {metricLabel(modelRow.overallScore)}</Badge>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="data-table min-w-full text-left text-xs">
                        <thead className="text-slate-300">
                          <tr>
                            <th className="px-2 py-2">Sponsor</th>
                            <th className="px-2 py-2">Cases</th>
                            <th className="px-2 py-2">Decision %</th>
                            <th className="px-2 py-2">Docs %</th>
                            <th className="px-2 py-2">Execution Signal %</th>
                            <th className="px-2 py-2">Sponsor Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr key={`${modelRow.model}-${row.sponsor}`} className="border-t border-white/10">
                              <td className="px-2 py-2 font-medium">{row.sponsor}</td>
                              <td className="px-2 py-2">{row.cases}</td>
                              <td className="px-2 py-2">{metricLabel(row.decisionAccuracyPct)}</td>
                              <td className="px-2 py-2">{metricLabel(row.docsGroundedPct)}</td>
                              <td className="px-2 py-2">{metricLabel(row.executionSignalPct)}</td>
                              <td className={`px-2 py-2 font-semibold ${toneForRate(row.sponsorScore)}`}>{metricLabel(row.sponsorScore)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                );
              })}
              {!sortedModels.length && !isLoading ? (
                <p className="text-sm text-slate-400">Run the benchmark to populate sponsor-level breakdown.</p>
              ) : null}
            </div>
          </Disclosure>
        </Card>

        <Card className="space-y-5 border-white/15 bg-panel/95 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Model Deep Dive</h2>
              <p className="text-sm text-slate-300">Pick one model and inspect all scenario-level tasks without page scrolling.</p>
            </div>
            <Badge className="border-white/20 bg-white/10 text-white">1-click model navigation</Badge>
          </div>

          <div className="flex flex-wrap gap-2">
            {sortedModels.map((row) => (
              <button
                key={row.model}
                type="button"
                onClick={() => setActiveModel(row.model)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  activeModel === row.model
                    ? "border-[#41d8b6] bg-[#41d8b6]/15 text-[#a6f5e3]"
                    : "border-white/20 bg-white/5 text-slate-200 hover:border-[#41d8b6]/40 hover:bg-[#41d8b6]/10"
                }`}
              >
                {row.model} ({paramsLabel(row.paramsBillions)})
              </button>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Card className="space-y-1 bg-soft/55 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Overall</p>
              <p className={`text-2xl font-semibold ${toneForRate(activeModelRow?.overallScore)}`}>
                {metricLabel(activeModelRow?.overallScore)}
              </p>
            </Card>
            <Card className="space-y-1 bg-soft/55 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Decision Accuracy</p>
              <p className={`text-2xl font-semibold ${toneForRate(activeModelRow?.decisionAccuracyPct)}`}>
                {metricLabel(activeModelRow?.decisionAccuracyPct, "%")}
              </p>
            </Card>
            <Card className="space-y-1 bg-soft/55 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Workflow Success</p>
              <p className={`text-2xl font-semibold ${toneForRate(activeModelRow?.workflowSuccessRatePct)}`}>
                {metricLabel(activeModelRow?.workflowSuccessRatePct, "%")}
              </p>
            </Card>
            <Card className="space-y-1 bg-soft/55 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Avg Latency</p>
              <p className="text-2xl font-semibold">{metricLabel(activeModelRow?.avgTotalLatencyMs, " ms")}</p>
            </Card>
          </div>

          <Disclosure title="Selected Model Sponsor View" subtitle="How this model performs by sponsor track" defaultOpen>
            <div className="overflow-x-auto">
              <table className="data-table min-w-full text-left text-sm">
                <thead className="text-slate-300">
                  <tr>
                    <th className="px-2 py-2">Sponsor</th>
                    <th className="px-2 py-2">Cases</th>
                    <th className="px-2 py-2">Decision %</th>
                    <th className="px-2 py-2">Docs %</th>
                    <th className="px-2 py-2">Execution Signal %</th>
                    <th className="px-2 py-2">Sponsor Score</th>
                  </tr>
                </thead>
                <tbody>
                  {activeModelSponsorRows.map((row) => (
                    <tr key={`${activeModel}-${row.sponsor}`} className="border-t border-white/10">
                      <td className="px-2 py-2 font-medium">{row.sponsor}</td>
                      <td className="px-2 py-2">{row.cases}</td>
                      <td className="px-2 py-2">{metricLabel(row.decisionAccuracyPct)}</td>
                      <td className="px-2 py-2">{metricLabel(row.docsGroundedPct)}</td>
                      <td className="px-2 py-2">{metricLabel(row.executionSignalPct)}</td>
                      <td className={`px-2 py-2 font-semibold ${toneForRate(row.sponsorScore)}`}>{metricLabel(row.sponsorScore)}</td>
                    </tr>
                  ))}
                  {!activeModelSponsorRows.length ? (
                    <tr>
                      <td className="px-2 py-3 text-slate-400" colSpan={6}>
                        No sponsor breakdown for selected model yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Disclosure>

          <Disclosure title="Selected Model Task Audit" subtitle="Case-by-case pass/fail with human-readable explanations" defaultOpen>
            <div className="space-y-4">
              {activeModelCaseRows.map((row) => {
                const checklist = buildHumanTaskChecklist(row);
                const passedCount = checklist.filter((item) => item.passed).length;
                const scenario = scenarioById.get(row.caseId) || scenarioById.get(row.scenarioId);
                const sponsors = caseSponsors(scenario, row.executionMode);
                return (
                  <Card key={`${row.model}-${row.caseId}`} className="border-white/15 bg-soft/55 p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                      <Badge className="border-white/20 bg-white/10 text-white">{row.caseName}</Badge>
                      <Badge className={`border ${statusChipTone(row.workflow.status)}`}>{normalizeWorkflowStatus(row.workflow.status)}</Badge>
                      <Badge className="border-white/20 bg-white/5 text-white">tasks passed: {passedCount}/{checklist.length}</Badge>
                      <Badge className="border-white/20 bg-white/5 text-white">latency: {metricLabel(row.totalLatencyMs)} ms</Badge>
                      {sponsors.map((sponsor) => (
                        <Badge key={`${row.caseId}-${sponsor}`} className="border-white/20 bg-white/5 text-white">
                          {sponsor}
                        </Badge>
                      ))}
                    </div>

                    <div className="space-y-2 text-sm">
                      {checklist.map((task) => (
                        <div
                          key={`${row.caseId}-${task.label}`}
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
              {!activeModelCaseRows.length && !isLoading ? (
                <p className="text-sm text-slate-400">Run the benchmark to generate model-level task audit rows.</p>
              ) : null}
            </div>
          </Disclosure>
        </Card>

        <Card className="space-y-4 border-white/15 bg-panel/95 p-6">
          <Disclosure title="Setup and Integration Requirements" subtitle="Explicit endpoint status and env template">
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

              <Card className="bg-soft/55 p-4">
                <p className="mb-2 text-sm font-semibold">Environment snippet</p>
                <pre className="overflow-auto rounded-lg bg-black/25 p-3 text-[11px] leading-5 text-slate-100">{envSnippet}</pre>
              </Card>
            </div>
          </Disclosure>

          {runTechnicalLog ? (
            <Disclosure title="Technical Logs" subtitle="Raw run output for debugging">
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
