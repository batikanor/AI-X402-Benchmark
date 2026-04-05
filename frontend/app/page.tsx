"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronDown,
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
import {
  fetchHealth,
  fetchReadinessDashboard,
  runReadinessBenchmark,
  type DocMode,
  type ReadinessDashboardResponse,
} from "@/lib/api";

type RuntimeMode = "ollama" | "openai_compat";
type SponsorKey = "Hedera" | "Chainlink" | "Ledger";
type ReadinessResult = ReadinessDashboardResponse["results"][number];
type ReadinessScenario = ReadinessDashboardResponse["scenarios"][number];

const HF_OPENAI_COMPAT_URL = "https://router.huggingface.co/v1";
const SPONSORS: SponsorKey[] = ["Hedera", "Chainlink", "Ledger"];
const OFFICIAL_DOC_DOMAINS = ["docs.hedera.com", "docs.chain.link", "developers.ledger.com", "eips.ethereum.org"];

type SponsorChallengeInfo = {
  title: string;
  prizePool: string;
  winnerSlots: string;
  focus: string;
};

type SponsorTrackInfo = {
  sponsor: SponsorKey;
  totalPrize: string;
  sourceUrl: string;
  challenges: SponsorChallengeInfo[];
};

const SPONSOR_TRACKS: SponsorTrackInfo[] = [
  {
    sponsor: "Hedera",
    totalPrize: "$15,000",
    sourceUrl: "https://ethglobal.com/events/cannes2026/prizes/hedera",
    challenges: [
      {
        title: "AI & Agentic Payments on Hedera",
        prizePool: "$6,000",
        winnerSlots: "Up to 2 teams ($3,000 each)",
        focus: "Build AI agents that execute real payment/token flows on Hedera Testnet.",
      },
      {
        title: "Tokenization on Hedera",
        prizePool: "$2,500",
        winnerSlots: "Up to 2 teams ($1,250 each)",
        focus: "Use Hedera Token Service for token lifecycle/compliance operations.",
      },
      {
        title: "\"No Solidity Allowed\" — Build with Hedera SDKs",
        prizePool: "$3,000",
        winnerSlots: "Up to 3 teams ($1,000 each)",
        focus: "Use Hedera SDK/native services directly, no Solidity contracts.",
      },
      {
        title: "ioBuilders Naryo Builder Challenge",
        prizePool: "$3,500",
        winnerSlots: "3 winners ($2,000 / $750 / $750)",
        focus: "Use Naryo event listener with Hedera EVM + Mirror Node/Relay.",
      },
    ],
  },
  {
    sponsor: "Chainlink",
    totalPrize: "$7,000",
    sourceUrl: "https://ethglobal.com/events/cannes2026/prizes/chainlink",
    challenges: [
      {
        title: "Best workflow with Chainlink CRE",
        prizePool: "$4,000",
        winnerSlots: "Up to 2 teams ($2,000 each)",
        focus: "Build/simulate/deploy CRE workflows integrating chain + external systems/LLMs/agents.",
      },
      {
        title: "Connect the World with Chainlink",
        prizePool: "$1,000",
        winnerSlots: "Core prize pool track",
        focus: "Use CCIP, Price Feeds, Data Streams, PoR, or VRF with meaningful on-chain state change.",
      },
      {
        title: "Best usage of Chainlink privacy standard",
        prizePool: "$2,000",
        winnerSlots: "Up to 2 teams ($1,000 each)",
        focus: "Use Confidential Compute and/or Confidential HTTP for privacy-preserving workflows.",
      },
    ],
  },
  {
    sponsor: "Ledger",
    totalPrize: "$10,000",
    sourceUrl: "https://ethglobal.com/events/cannes2026/prizes/ledger",
    challenges: [
      {
        title: "AI Agents x Ledger",
        prizePool: "$6,000",
        winnerSlots: "3 winners ($3,000 / $2,000 / $1,000)",
        focus: "Use Ledger as trust layer for agent payments, approvals, identity, or copilots.",
      },
      {
        title: "Clear Signing, Integrations & Apps",
        prizePool: "$4,000",
        winnerSlots: "2 winners ($2,500 / $1,500)",
        focus: "Improve Clear Signing, SDK/wallet integrations, device apps, and Ledger UX.",
      },
    ],
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
  totalCases: number;
  realCases: number;
  decisionOnlyCases: number;
  eligibleCases: number;
  eligibleRealCases: number;
  executedCases: number;
  successfulExecutions: number;
  decisionAccuracyPct: number;
  docsGroundedPct: number;
  executionGatePct: number;
  executedPassPct: number;
  executionSignalPct: number;
  executionSignalBasis: "executed_pass" | "gate_eligibility";
  sponsorScore: number;
};

type ModelCaseStats = {
  totalCases: number;
  realCases: number;
  decisionOnlyCases: number;
  eligibleCases: number;
  eligibleRealCases: number;
  executedCases: number;
  successfulExecutions: number;
};

type MethodologyExampleRow = {
  sponsor: SponsorKey;
  caseType: "real" | "decision_only";
  caseId: string;
  caseName: string;
  mappedChallenges: string[];
  rationale: string;
  present: boolean;
  scenario: ReadinessScenario | null;
};

type WorkflowTraceStep = {
  id: string;
  label: string;
  attempted: boolean;
  status: string;
  durationMs: number;
  retriesUsed: number;
  mode?: string | null;
  endpoint?: string | null;
  detail?: string | null;
};

type MetricHeaderProps = {
  label: string;
  help: string;
};

function Disclosure({ title, subtitle, children, defaultOpen = false }: DisclosureProps) {
  return (
    <details open={defaultOpen} className="group rounded-2xl border border-[#4a4a46] bg-soft p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <div>
          <p className="text-sm font-semibold text-stone-100">{title}</p>
          {subtitle ? <p className="text-xs text-stone-400">{subtitle}</p> : null}
        </div>
        <ChevronDown size={16} className="text-stone-400 transition group-open:rotate-180" />
      </summary>
      <div className="pt-4">{children}</div>
    </details>
  );
}

function MetricHeader({ label, help }: MetricHeaderProps) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <span className="relative inline-flex">
        <button
          type="button"
          aria-label={`${label}: ${help}`}
          className="peer inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#6b6b65] bg-[#1f1d1a] text-[10px] font-bold text-stone-200"
          title={help}
        >
          ?
        </button>
        <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-64 -translate-x-1/2 rounded-md border border-[#4a4a46] bg-[#20201e] p-2 text-[11px] normal-case text-stone-200 shadow-glow peer-hover:block peer-focus-visible:block">
          {help}
        </span>
      </span>
    </span>
  );
}

function metricLabel(value: number | undefined, suffix = ""): string {
  if (value === undefined || Number.isNaN(value)) return "-";
  return `${value.toFixed(2)}${suffix}`;
}

function ratioLabel(numerator: number, denominator: number): string {
  return `${numerator}/${denominator}`;
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
  if (value === "decision_only_case") return "decision-only case";
  if (value === "blocked_by_policy_expectation") return "policy-blocked case";
  if (value === "not_executed_parse_failure") return "not executed (parse failure)";
  if (value === "not_executed_decision_mismatch") return "not executed (decision mismatch)";
  if (value === "not_executed_approval_mismatch") return "not executed (approval mismatch)";
  if (value === "not_executed_priority_mismatch") return "not executed (priority mismatch)";
  if (value === "not_executed_risk_mismatch") return "not executed (risk mismatch)";
  if (value === "not_executed_controls_below_threshold") return "not executed (controls below threshold)";
  if (value === "not_executed_unknown_gate_failure") return "not executed (gate failure)";
  if (value.includes("blocked")) return "blocked";
  if (value.includes("mismatch")) return "mismatch";
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
  if (value === undefined || Number.isNaN(value)) return "text-stone-200";
  if (value >= 85) return "text-emerald-300";
  if (value >= 60) return "text-amber-200";
  return "text-rose-300";
}

function statusChipTone(status: string | undefined): string {
  const normalized = normalizeWorkflowStatus(status);
  if (normalized === "success") return "border-emerald-300/30 bg-emerald-300/10 text-emerald-200";
  if (normalized === "failed") return "border-rose-300/30 bg-rose-300/10 text-rose-200";
  if (normalized.includes("not executed") || normalized.includes("blocked")) return "border-amber-300/30 bg-amber-300/10 text-amber-200";
  if (normalized.includes("decision-only")) return "border-[#6b6b65] bg-[#1f1d1a] text-stone-200";
  return "border-[#6b6b65] bg-[#1f1d1a] text-stone-200";
}

function passLabel(value: boolean): string {
  return value ? "pass" : "fail";
}

function docModeLabel(mode: DocMode): string {
  return mode === "with_docs" ? "With Docs Context" : "Without Docs Context";
}

function executionModeLabel(mode: string | undefined): "real" | "decision_only" {
  return String(mode || "").toLowerCase() === "real" ? "real" : "decision_only";
}

function executionModeText(mode: "real" | "decision_only"): string {
  return mode === "real" ? "Real workflow" : "Decision-only";
}

function caseSponsors(caseDef: ReadinessScenario | undefined, fallbackExecutionMode: string): SponsorKey[] {
  const explicitTargets = Array.isArray(caseDef?.challengeTargets) ? caseDef.challengeTargets : [];
  const explicitSponsors = explicitTargets
    .map((item) => String(item?.sponsor || ""))
    .filter((item): item is SponsorKey => SPONSORS.includes(item as SponsorKey));
  if (explicitSponsors.length) {
    return Array.from(new Set(explicitSponsors));
  }

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

function executionGateFailureDetail(result: ReadinessResult): string {
  if (result.executionMode !== "real") {
    return "Decision-only case: execution gate is not applicable.";
  }
  if (result.expected.decision !== "allow") {
    return "Policy-expected block case: execution is intentionally skipped.";
  }
  if (result.evaluation.executionEligible) {
    return "Passed policy execution gate and became executable.";
  }

  const mapping: Record<string, string> = {
    parse_failure: "output was not parseable strict JSON",
    decision_mismatch: "allow/block decision mismatch",
    approval_mismatch: "approval requirement mismatch",
    priority_mismatch: "priority mismatch",
    risk_mismatch: "risk-level mismatch",
    controls_below_threshold: "control-selection quality below threshold (F1 < 60)",
    unknown_gate_failure: "unknown gate failure",
  };

  const failures = (result.executionGateFailures ?? []).filter(Boolean);
  if (!failures.length) {
    const inferred: string[] = [];
    if (!result.llm.parseOk) inferred.push("parse_failure");
    if (!result.evaluation.decisionMatch) inferred.push("decision_mismatch");
    if (!result.evaluation.approvalMatch) inferred.push("approval_mismatch");
    if (!result.evaluation.priorityMatch) inferred.push("priority_mismatch");
    if (!result.evaluation.riskMatch) inferred.push("risk_mismatch");
    if ((result.evaluation.controlsF1Pct ?? 0) < 60) inferred.push("controls_below_threshold");
    if (!inferred.length) inferred.push("unknown_gate_failure");
    return `Gate failed because ${inferred.map((item) => mapping[item] ?? item).join("; ")}.`;
  }

  return `Gate failed because ${failures.map((item) => mapping[item] ?? item).join("; ")}.`;
}

function methodologyCaseKey(row: MethodologyExampleRow): string {
  return `${row.sponsor}::${row.caseType}`;
}

function methodologyResultKey(row: ReadinessResult): string {
  return `${row.model}::${resolveResultDocMode(row)}`;
}

function resolveResultDocMode(row: ReadinessResult): DocMode {
  return (row.docMode ?? (row.docs?.enabled ? "with_docs" : "without_docs")) as DocMode;
}

function traceStatusTone(status: string): string {
  const normalized = String(status || "").toLowerCase();
  if (["success", "passed", "approved", "ok"].includes(normalized)) return "text-emerald-300";
  if (["failed", "rejected"].includes(normalized)) return "text-rose-300";
  if (["skipped", "not_required", "blocked"].includes(normalized)) return "text-amber-200";
  return "text-stone-200";
}

function ensureWorkflowTrace(result: ReadinessResult): WorkflowTraceStep[] {
  const declared = Array.isArray(result.workflow.trace) ? (result.workflow.trace as WorkflowTraceStep[]) : [];
  if (declared.length) return declared;

  const fallbackDetail = result.workflow.executed
    ? "Detailed per-stage trace not available in this older run artifact."
    : executionGateFailureDetail(result);

  const steps: WorkflowTraceStep[] = [
    {
      id: "ledger_policy",
      label: "Ledger policy pre-check",
      attempted: result.workflow.executed,
      status: result.workflow.executed ? "unknown" : "skipped",
      durationMs: 0,
      retriesUsed: 0,
      mode: "local_policy",
      endpoint: "local-policy-engine",
      detail: fallbackDetail,
    },
    {
      id: "ledger_approval",
      label: "Ledger approval check",
      attempted: result.workflow.executed && Boolean(result.expected.approvalRequired),
      status: result.workflow.executed
        ? result.expected.approvalRequired
          ? "unknown"
          : "not_required"
        : "skipped",
      durationMs: 0,
      retriesUsed: 0,
      detail: fallbackDetail,
    },
    {
      id: "chainlink_workflow",
      label: "Chainlink workflow orchestration",
      attempted: result.workflow.executed,
      status: result.workflow.executed ? "unknown" : "skipped",
      durationMs: 0,
      retriesUsed: result.workflow.retryCount ?? 0,
      detail: fallbackDetail,
    },
    {
      id: "hedera_settlement",
      label: "Hedera settlement",
      attempted: result.workflow.executed,
      status: result.workflow.executed ? "unknown" : "skipped",
      durationMs: 0,
      retriesUsed: 0,
      detail: fallbackDetail,
    },
    {
      id: "service_probe",
      label: "Service probe",
      attempted: result.workflow.executed,
      status: result.workflow.executed
        ? normalizeWorkflowStatus(result.workflow.status) === "success"
          ? "success"
          : "unknown"
        : "skipped",
      durationMs: 0,
      retriesUsed: 0,
      detail: fallbackDetail,
    },
  ];
  return steps;
}

function traceMeasurementFocus(stepId: string): string {
  if (stepId === "ledger_policy") {
    return "Policy threshold/sanctions check latency and allow/block correctness before any external call.";
  }
  if (stepId === "ledger_approval") {
    return "High-value approval path behavior (required/optional), approver response, and signer integration health.";
  }
  if (stepId === "chainlink_workflow") {
    return "Workflow orchestration call success, retries, and endpoint reliability.";
  }
  if (stepId === "hedera_settlement") {
    return "On-chain settlement submission success and transaction hash return path.";
  }
  if (stepId === "service_probe") {
    return "Post-settlement downstream validation endpoint behavior and response consistency.";
  }
  return "Operational stage signal.";
}

function buildHumanTaskChecklist(result: ReadinessResult): HumanTask[] {
  const expectedControls = result.expected.requiredControls ?? [];
  const modelControls = result.llm.requiredControls ?? [];
  const workflowStatus = normalizeWorkflowStatus(result.workflow.status);
  const workflowSucceeded = workflowStatus === "success";
  const docsEnabled = Boolean(result.docs?.enabled);
  const isDecisionOnly = result.executionMode !== "real";
  const isPolicyBlockCase = result.expected.decision !== "allow";

  const workflowTask: HumanTask =
    isDecisionOnly
      ? {
          label: "Run execution path",
          passed: true,
          detail: "Case is decision-only, so execution is intentionally skipped.",
        }
      : isPolicyBlockCase
        ? {
            label: "Run execution path",
            passed: true,
            detail: "Expected policy outcome is block, so no live execution is attempted.",
          }
      : {
          label: "Run execution path",
          passed: workflowSucceeded,
          detail: workflowSucceeded
            ? `Workflow succeeded in ${metricLabel(result.workflow.durationMs)} ms.`
            : `Workflow status: ${workflowStatus}. ${rowTopIssue(result.workflow.notes ?? [])}`,
        };

  const executionGateTask: HumanTask =
    isDecisionOnly || isPolicyBlockCase
      ? {
          label: "Pass execution eligibility gate",
          passed: true,
          detail: executionGateFailureDetail(result),
        }
      : {
          label: "Pass execution eligibility gate",
          passed: Boolean(result.evaluation.executionEligible),
          detail: executionGateFailureDetail(result),
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
      label: "Meet control threshold for execution",
      passed: (result.evaluation.controlsF1Pct ?? 0) >= 60,
      detail: `Execution threshold is F1 >= 60. Current controls F1 ${metricLabel(result.evaluation.controlsF1Pct)}%.`,
    },
    {
      label: "Match required controls strictly",
      passed: (result.evaluation.controlsF1Pct ?? 0) >= 99.9,
      detail: `Expected: ${joinList(expectedControls)} | Returned: ${joinList(modelControls)} | Controls F1 ${metricLabel(result.evaluation.controlsF1Pct)}%.`,
    },
    {
      label: "Ground answer in required docs",
      passed: docsEnabled ? Boolean(result.evaluation.docsGrounded) : true,
      detail: docsEnabled
        ? `Required sources hit: ${joinList(result.evaluation.requiredSourceHits ?? [])}. Coverage ${metricLabel(result.evaluation.requiredSourceCoveragePct)}%.`
        : "Documentation grounding is disabled for this run.",
    },
    {
      label: "Provide valid citations",
      passed: docsEnabled ? (result.evaluation.citationValidityPct ?? 0) >= 90 : true,
      detail: docsEnabled
        ? `${result.evaluation.validCitationCount ?? 0}/${result.evaluation.citationCount ?? 0} citations valid (${metricLabel(result.evaluation.citationValidityPct)}%).`
        : "Citation validation is disabled because docs grounding is off.",
    },
    executionGateTask,
    workflowTask,
  ];
}

export default function HomePage() {
  const { data, error, isLoading, mutate } = useSWR("readiness-dashboard", fetchReadinessDashboard, {
    refreshInterval: 15000,
  });

  const [runtime, setRuntime] = useState<RuntimeMode>("ollama");
  const [customModels, setCustomModels] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [apiKeyEnv, setApiKeyEnv] = useState("OPENAI_API_KEY");
  const [docsPackPath, setDocsPackPath] = useState("");
  const [requireCitations, setRequireCitations] = useState(true);
  const [runsPerScenario, setRunsPerScenario] = useState(1);
  const [running, setRunning] = useState(false);
  const [runSummary, setRunSummary] = useState("");
  const [runTechnicalLog, setRunTechnicalLog] = useState("");
  const [activeModel, setActiveModel] = useState("");
  const [analysisDocMode, setAnalysisDocMode] = useState<DocMode>("with_docs");
  const [sponsorShowAllModels, setSponsorShowAllModels] = useState(false);
  const [activeMethodologyCase, setActiveMethodologyCase] = useState("");
  const [activeMethodologyResult, setActiveMethodologyResult] = useState("");

  useEffect(() => {
    if (runtime !== "openai_compat") return;
    setApiBaseUrl((previous) => previous || HF_OPENAI_COMPAT_URL);
  }, [runtime]);

  const latestRunModels = useMemo(() => {
    const models = [
      ...(data?.models ?? []).map((item) => item.model),
      ...(data?.modelsByDocMode?.with_docs ?? []).map((item) => item.model),
      ...(data?.modelsByDocMode?.without_docs ?? []).map((item) => item.model),
    ];
    return Array.from(new Set(models.map((item) => String(item || "").trim()).filter(Boolean)));
  }, [data?.models, data?.modelsByDocMode?.with_docs, data?.modelsByDocMode?.without_docs]);

  useEffect(() => {
    if (customModels.trim()) return;
    if (!latestRunModels.length) return;
    setCustomModels(latestRunModels.join(","));
  }, [customModels, latestRunModels]);

  useEffect(() => {
    const docs = data?.track.docs;
    if (!docs) return;
    setRequireCitations(docs.requireCitations);
    if (!docsPackPath && docs.defaultPackPath) {
      setDocsPackPath(docs.defaultPackPath);
    }
  }, [data?.track.docs, docsPackPath]);

  const availableDocModes = useMemo(() => {
    const fromTrack = (data?.track.docs?.modes ?? []).filter((mode): mode is DocMode => mode === "with_docs" || mode === "without_docs");
    if (fromTrack.length) return Array.from(new Set(fromTrack));
    return ["with_docs"] as DocMode[];
  }, [data?.track.docs?.modes]);

  useEffect(() => {
    if (!availableDocModes.includes(analysisDocMode)) {
      setAnalysisDocMode(availableDocModes[0] ?? "with_docs");
    }
  }, [availableDocModes, analysisDocMode]);

  const modeModelRows = useMemo(() => {
    const byMode = data?.modelsByDocMode;
    if (byMode) {
      const modeRows = analysisDocMode === "with_docs" ? byMode.with_docs : byMode.without_docs;
      if (Array.isArray(modeRows) && modeRows.length) return modeRows;
    }
    return data?.models ?? [];
  }, [data?.modelsByDocMode, data?.models, analysisDocMode]);

  const sortedModels = useMemo(() => {
    if (!modeModelRows.length) return [];
    return [...modeModelRows].sort((a, b) => {
      if (b.overallScore !== a.overallScore) return b.overallScore - a.overallScore;
      if (b.decisionAccuracyPct !== a.decisionAccuracyPct) return b.decisionAccuracyPct - a.decisionAccuracyPct;
      return a.avgTotalLatencyMs - b.avgTotalLatencyMs;
    });
  }, [modeModelRows]);

  useEffect(() => {
    if (!sortedModels.length) {
      setActiveModel("");
      return;
    }
    if (!activeModel || !sortedModels.some((row) => row.model === activeModel)) {
      setActiveModel(sortedModels[0].model);
    }
  }, [sortedModels, activeModel]);

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
    return parseModelCsv(customModels);
  }, [customModels]);

  const latestResultRows = useMemo(() => {
    const results = data?.results ?? [];
    const latestByModelCase = new Map<string, ReadinessResult>();
    for (const item of results) {
      const mode = (item.docMode ?? (item.docs?.enabled ? "with_docs" : "without_docs")) as DocMode;
      const key = `${item.model}::${mode}::${item.caseId}`;
      const previous = latestByModelCase.get(key);
      if (!previous || item.attempt > previous.attempt) {
        latestByModelCase.set(key, item);
      }
    }
    return Array.from(latestByModelCase.values());
  }, [data?.results]);

  const activeModeResultRows = useMemo(() => {
    return latestResultRows.filter((row) => {
      const rowMode = (row.docMode ?? (row.docs?.enabled ? "with_docs" : "without_docs")) as DocMode;
      return rowMode === analysisDocMode;
    });
  }, [latestResultRows, analysisDocMode]);

  const scenarioById = useMemo(() => {
    const map = new Map<string, ReadinessScenario>();
    for (const scenario of data?.scenarios ?? []) {
      map.set(scenario.id, scenario);
    }
    return map;
  }, [data?.scenarios]);

  const suiteCaseMix = useMemo(() => {
    const scenarios = data?.scenarios ?? [];
    const real = scenarios.filter((scenario) => String(scenario.executionMode).toLowerCase() === "real").length;
    return {
      total: scenarios.length,
      real,
      decisionOnly: scenarios.length - real,
    };
  }, [data?.scenarios]);

  const modelCaseStatsByModel = useMemo(() => {
    const map = new Map<string, ModelCaseStats>();

    for (const modelRow of sortedModels) {
      const rows = activeModeResultRows.filter((row) => row.model === modelRow.model);
      const realCases = rows.filter((row) => row.executionMode === "real");
      const eligibleCases = rows.filter((row) => row.evaluation.executionEligible);
      const eligibleRealCases = realCases.filter((row) => row.evaluation.executionEligible);
      const executedCases = rows.filter((row) => row.workflow.executed);
      const successfulExecutions = executedCases.filter((row) => normalizeWorkflowStatus(row.workflow.status) === "success").length;

      map.set(modelRow.model, {
        totalCases: rows.length,
        realCases: realCases.length,
        decisionOnlyCases: rows.length - realCases.length,
        eligibleCases: eligibleCases.length,
        eligibleRealCases: eligibleRealCases.length,
        executedCases: executedCases.length,
        successfulExecutions,
      });
    }

    return map;
  }, [sortedModels, activeModeResultRows]);

  const leader = sortedModels[0];
  const leaderExecutionDetail = useMemo(() => {
    if (!leader) return "No run data yet.";
    const stats = modelCaseStatsByModel.get(leader.model);
    if (!stats) return "No run data yet.";
    if (stats.realCases === 0) return "No real execution cases in this benchmark suite.";
    if (stats.eligibleRealCases === 0) {
      return `No real cases passed the execution gate (${ratioLabel(0, stats.realCases)}), so execution pass rate is 0%.`;
    }
    if (stats.executedCases === 0) {
      return `Real cases became eligible (${ratioLabel(stats.eligibleRealCases, stats.realCases)}) but none executed.`;
    }
    return `Executed real cases passed: ${ratioLabel(stats.successfulExecutions, stats.executedCases)} | Gate-eligible real: ${ratioLabel(stats.eligibleRealCases, stats.realCases)}.`;
  }, [leader, modelCaseStatsByModel]);

  const sponsorBreakdownByModel = useMemo(() => {
    const byModel = new Map<string, SponsorAggregate[]>();

    for (const modelRow of sortedModels) {
      const modelRows = activeModeResultRows.filter((row) => row.model === modelRow.model);
      const sponsorRows: SponsorAggregate[] = [];

      for (const sponsor of SPONSORS) {
        const scoped = modelRows.filter((row) => {
          const scenario = scenarioById.get(row.caseId) || scenarioById.get(row.scenarioId);
          return caseSponsors(scenario, row.executionMode).includes(sponsor);
        });

        if (!scoped.length) {
          sponsorRows.push({
            sponsor,
            totalCases: 0,
            realCases: 0,
            decisionOnlyCases: 0,
            eligibleCases: 0,
            eligibleRealCases: 0,
            executedCases: 0,
            successfulExecutions: 0,
            decisionAccuracyPct: 0,
            docsGroundedPct: 0,
            executionGatePct: 0,
            executedPassPct: 0,
            executionSignalPct: 0,
            executionSignalBasis: "gate_eligibility",
            sponsorScore: 0,
          });
          continue;
        }

        const realCases = scoped.filter((row) => row.executionMode === "real");
        const decisionOnlyCases = scoped.length - realCases.length;
        const eligibleCases = scoped.filter((row) => row.evaluation.executionEligible);
        const eligibleRealCases = realCases.filter((row) => row.evaluation.executionEligible);
        const executed = scoped.filter((row) => row.workflow.executed);
        const successfulExecutions = executed.filter((row) => normalizeWorkflowStatus(row.workflow.status) === "success").length;

        const decisionAccuracyPct = scoped.reduce((acc, row) => acc + (row.evaluation.accuracyPct ?? 0), 0) / scoped.length;
        const docsGroundedPct =
          (scoped.filter((row) => row.evaluation.docsGrounded).length / scoped.length) * 100;

        const executionGatePct = (eligibleCases.length / scoped.length) * 100;
        const executedPassPct = executed.length ? (successfulExecutions / executed.length) * 100 : 0;
        const executionSignalPct = executed.length ? executedPassPct : executionGatePct;
        const executionSignalBasis = executed.length ? "executed_pass" : "gate_eligibility";

        const sponsorScore =
          decisionAccuracyPct * 0.5 +
          docsGroundedPct * 0.3 +
          executionSignalPct * 0.2;

        sponsorRows.push({
          sponsor,
          totalCases: scoped.length,
          realCases: realCases.length,
          decisionOnlyCases,
          eligibleCases: eligibleCases.length,
          eligibleRealCases: eligibleRealCases.length,
          executedCases: executed.length,
          successfulExecutions,
          decisionAccuracyPct,
          docsGroundedPct,
          executionGatePct,
          executedPassPct,
          executionSignalPct,
          executionSignalBasis,
          sponsorScore,
        });
      }

      byModel.set(modelRow.model, sponsorRows);
    }

    return byModel;
  }, [sortedModels, activeModeResultRows, scenarioById]);

  const activeModelRow = useMemo(
    () => sortedModels.find((row) => row.model === activeModel) ?? null,
    [sortedModels, activeModel],
  );
  const activeModelCaseStats = useMemo(
    () => (activeModel ? modelCaseStatsByModel.get(activeModel) ?? null : null),
    [activeModel, modelCaseStatsByModel],
  );

  const activeModelSponsorRows = useMemo(
    () => sponsorBreakdownByModel.get(activeModel ?? "") ?? [],
    [sponsorBreakdownByModel, activeModel],
  );

  const modelComparisons = useMemo(() => {
    if (data?.modelComparisons?.length) return data.modelComparisons;

    const withDocs = data?.modelsByDocMode?.with_docs ?? [];
    const withoutDocs = data?.modelsByDocMode?.without_docs ?? [];
    if (!withDocs.length && !withoutDocs.length) return [];

    const byModel = new Map<
      string,
      {
        model: string;
        paramsBillions: number | null;
        withDocs: ReadinessDashboardResponse["models"][number] | null;
        withoutDocs: ReadinessDashboardResponse["models"][number] | null;
        deltaOverallScore: number | null;
        deltaDecisionAccuracyPct: number | null;
        deltaWorkflowSuccessRatePct: number | null;
        deltaDocsGroundingRatePct: number | null;
      }
    >();

    const ensure = (model: string, paramsBillions: number | null) => {
      if (!byModel.has(model)) {
        byModel.set(model, {
          model,
          paramsBillions,
          withDocs: null,
          withoutDocs: null,
          deltaOverallScore: null,
          deltaDecisionAccuracyPct: null,
          deltaWorkflowSuccessRatePct: null,
          deltaDocsGroundingRatePct: null,
        });
      }
      const entry = byModel.get(model)!;
      if (entry.paramsBillions == null && paramsBillions != null) entry.paramsBillions = paramsBillions;
      return entry;
    };

    for (const row of withDocs) {
      const entry = ensure(row.model, row.paramsBillions);
      entry.withDocs = row;
    }
    for (const row of withoutDocs) {
      const entry = ensure(row.model, row.paramsBillions);
      entry.withoutDocs = row;
    }

    for (const entry of byModel.values()) {
      if (entry.withDocs && entry.withoutDocs) {
        entry.deltaOverallScore = Number((entry.withDocs.overallScore - entry.withoutDocs.overallScore).toFixed(2));
        entry.deltaDecisionAccuracyPct = Number((entry.withDocs.decisionAccuracyPct - entry.withoutDocs.decisionAccuracyPct).toFixed(2));
        entry.deltaWorkflowSuccessRatePct = Number((entry.withDocs.workflowSuccessRatePct - entry.withoutDocs.workflowSuccessRatePct).toFixed(2));
        entry.deltaDocsGroundingRatePct = Number((entry.withDocs.docsGroundingRatePct - entry.withoutDocs.docsGroundingRatePct).toFixed(2));
      }
    }

    return Array.from(byModel.values()).sort((a, b) => {
      const aScore = a.withDocs?.overallScore ?? a.withoutDocs?.overallScore ?? -1;
      const bScore = b.withDocs?.overallScore ?? b.withoutDocs?.overallScore ?? -1;
      return bScore - aScore;
    });
  }, [data?.modelComparisons, data?.modelsByDocMode?.with_docs, data?.modelsByDocMode?.without_docs]);

  const scenarioCoverageRows = useMemo(() => {
    const scenarios = data?.scenarios ?? [];
    return SPONSORS.map((sponsor) => {
      let mappedCases = 0;
      let realCases = 0;
      let decisionOnlyCases = 0;
      for (const scenario of scenarios) {
        const sponsors = caseSponsors(scenario, scenario.executionMode);
        if (!sponsors.includes(sponsor)) continue;
        mappedCases += 1;
        if (String(scenario.executionMode).toLowerCase() === "real") realCases += 1;
        else decisionOnlyCases += 1;
      }
      return { sponsor, mappedCases, realCases, decisionOnlyCases };
    });
  }, [data?.scenarios]);

  const methodologyExampleRows = useMemo(() => {
    const scenarios = data?.scenarios ?? [];
    const rows: MethodologyExampleRow[] = [];
    const caseTypes: Array<"real" | "decision_only"> = ["real", "decision_only"];

    for (const sponsor of SPONSORS) {
      for (const caseType of caseTypes) {
        const scenario = scenarios.find((item) => {
          const targets = caseSponsors(item, item.executionMode);
          return targets.includes(sponsor) && executionModeLabel(item.executionMode) === caseType;
        });
        if (!scenario) {
          rows.push({
            sponsor,
            caseType,
            caseId: "-",
            caseName: "No mapped case in current suite version",
            mappedChallenges: [],
            rationale: "Add a scenario mapped to this sponsor/case-type pair if you want this cell benchmarked.",
            present: false,
            scenario: null,
          });
          continue;
        }

        const challengeTargets = Array.isArray(scenario.challengeTargets) ? scenario.challengeTargets : [];
        const mappedChallenges = challengeTargets
          .filter((item) => String(item?.sponsor || "") === sponsor)
          .map((item) => String(item?.challenge || "").trim())
          .filter(Boolean);

        rows.push({
          sponsor,
          caseType,
          caseId: String(scenario.id || "-"),
          caseName: String(scenario.name || "Unnamed scenario"),
          mappedChallenges,
          rationale: String(scenario.representativeRationale || "No representative rationale provided in suite."),
          present: true,
          scenario,
        });
      }
    }

    return rows;
  }, [data?.scenarios]);

  const presentMethodologyRows = useMemo(
    () => methodologyExampleRows.filter((row) => row.present),
    [methodologyExampleRows],
  );

  useEffect(() => {
    if (!presentMethodologyRows.length) {
      setActiveMethodologyCase("");
      return;
    }
    if (!activeMethodologyCase || !presentMethodologyRows.some((row) => methodologyCaseKey(row) === activeMethodologyCase)) {
      setActiveMethodologyCase(methodologyCaseKey(presentMethodologyRows[0]));
    }
  }, [presentMethodologyRows, activeMethodologyCase]);

  const selectedMethodologyRow = useMemo(() => {
    if (!methodologyExampleRows.length) return null;
    const selected = methodologyExampleRows.find((row) => methodologyCaseKey(row) === activeMethodologyCase);
    if (selected?.present) return selected;
    return presentMethodologyRows[0] ?? methodologyExampleRows[0] ?? null;
  }, [methodologyExampleRows, presentMethodologyRows, activeMethodologyCase]);

  const selectedMethodologyResultRows = useMemo(() => {
    if (!selectedMethodologyRow?.present) return [];
    return latestResultRows
      .filter((row) => row.caseId === selectedMethodologyRow.caseId)
      .sort((a, b) => {
        if (a.model !== b.model) return a.model.localeCompare(b.model);
        return resolveResultDocMode(a).localeCompare(resolveResultDocMode(b));
      });
  }, [latestResultRows, selectedMethodologyRow]);

  useEffect(() => {
    if (!selectedMethodologyResultRows.length) {
      setActiveMethodologyResult("");
      return;
    }
    const preferred = selectedMethodologyResultRows.find(
      (row) => row.model === activeModel && resolveResultDocMode(row) === analysisDocMode,
    );
    const defaultKey = methodologyResultKey(preferred ?? selectedMethodologyResultRows[0]);
    if (!activeMethodologyResult || !selectedMethodologyResultRows.some((row) => methodologyResultKey(row) === activeMethodologyResult)) {
      setActiveMethodologyResult(defaultKey);
    }
  }, [selectedMethodologyResultRows, activeMethodologyResult, activeModel, analysisDocMode]);

  const selectedMethodologyResultRow = useMemo(() => {
    if (!selectedMethodologyResultRows.length) return null;
    return selectedMethodologyResultRows.find((row) => methodologyResultKey(row) === activeMethodologyResult) ?? selectedMethodologyResultRows[0];
  }, [selectedMethodologyResultRows, activeMethodologyResult]);

  const selectedMethodologyTrace = useMemo(
    () => (selectedMethodologyResultRow ? ensureWorkflowTrace(selectedMethodologyResultRow) : []),
    [selectedMethodologyResultRow],
  );

  const activeModelCaseRows = useMemo(() => {
    return activeModeResultRows
      .filter((row) => row.model === activeModel)
      .sort((a, b) => a.caseName.localeCompare(b.caseName));
  }, [activeModeResultRows, activeModel]);

  const sponsorVisibleModels = useMemo(() => {
    if (sponsorShowAllModels) return sortedModels;
    if (!activeModel) return [];
    return sortedModels.filter((row) => row.model === activeModel);
  }, [sortedModels, activeModel, sponsorShowAllModels]);

  const integrationsReady = data?.track.integrationStatus?.isFullyConfigured ?? false;
  const runStatusTone = integrationsReady ? "text-emerald-200" : "text-amber-200";
  const runStatusLabel = integrationsReady
    ? "Explicit integration endpoints are configured."
    : "Using local integration fallbacks where explicit endpoints are missing.";

  async function handleRun() {
    if (effectiveModels.length < 2) {
      setRunSummary("Enter at least 2 models in the manual model list to run a readiness comparison.");
      return;
    }

    try {
      const health = await fetchHealth();
      if (health.readinessRunInProgress) {
        setRunSummary("A readiness run is already active. Wait for it to finish, then refresh before starting another run.");
        return;
      }

      setRunning(true);
      const result = await runReadinessBenchmark({
        models: effectiveModels,
        runtime,
        apiBaseUrl: apiBaseUrl.trim() || undefined,
        apiKeyEnv: apiKeyEnv.trim() || undefined,
        docsPackPath: docsPackPath.trim() || undefined,
        docsTopK: 0,
        requireCitations,
        runsPerScenario,
        maxTokens: 512,
        temperature: 0.1,
      });

      setRunTechnicalLog(compactLog(result.stdout || result.stderr || ""));
      const updated = await mutate();
      const updatedModeRows = updated?.modelsByDocMode?.[analysisDocMode] ?? updated?.models ?? [];
      const topModel = updatedModeRows.length
        ? [...updatedModeRows].sort((a, b) => b.overallScore - a.overallScore)[0]
        : null;

      if (result.ok) {
        if (updated?.latest && topModel) {
          setRunSummary(
            `Run completed (${docModeLabel(analysisDocMode)} view). Leader ${topModel.model} (${paramsLabel(topModel.paramsBillions)}) | Score ${metricLabel(topModel.overallScore)} | Decision ${metricLabel(topModel.decisionAccuracyPct, "%")} | Workflow ${metricLabel(topModel.workflowSuccessRatePct, "%")} | Run ${updated.latest.runId}.`,
          );
        } else {
          setRunSummary("Run completed. Dashboard is refreshing.");
        }
      } else {
        if (result.returnCode === 409) {
          setRunSummary("Run not started because another readiness run is already active. Retry after current run completes.");
        } else {
          setRunSummary(`Run not completed (code ${result.returnCode}). Open Technical logs.`);
        }
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
        <Card className="border-[#4a4a46] bg-[#1f1d1a] p-6 md:p-8">
          <div className="relative z-10 flex flex-wrap items-start justify-between gap-5">
            <div className="space-y-3">
              <Badge className="gap-1 border-[#6b6b65] bg-[#353129] text-stone-100">
                <Sparkles size={12} />
                Live Readiness Leaderboard
              </Badge>
              <h1 className="text-3xl font-medium tracking-tight md:text-4xl">x402Bench LLM Readiness</h1>
              <p className="max-w-4xl text-sm text-stone-200 md:text-[15px]">
                Compare models with and without documentation context across policy quality, docs grounding, and real sponsor-workflow execution.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {(data?.project.sponsors ?? SPONSORS).map((sponsor) => (
                  <Badge key={sponsor} className="border-[#6b6b65] bg-[#353129] text-stone-100">
                    {sponsor}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="w-full max-w-sm rounded-2xl border border-[#4a4a46] bg-[#353129] p-4">
              <p className="text-[11px] uppercase tracking-[0.12em] text-stone-400">Latest Run</p>
              <p className="mt-1 truncate text-sm font-medium text-stone-100">{data?.latest?.runId ?? "No run yet"}</p>
              <p className="mt-1 text-xs text-stone-400">{formatDateTime(data?.latest?.finishedAt)}</p>
              <p className={`mt-3 text-xs ${runStatusTone}`}>{runStatusLabel}</p>
            </div>
          </div>
        </Card>
      </section>

      <section className="mb-6">
          <Disclosure
            title="ETHGlobal Cannes 2026 Sponsor Challenge Map"
            subtitle="Official challenge breakdown for sponsors used in this benchmark."
            defaultOpen
          >
            <div className="grid gap-4 lg:grid-cols-3">
              {SPONSOR_TRACKS.map((track) => (
                <Card key={track.sponsor} className="space-y-3 border-[#4a4a46] bg-panel p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold">{track.sponsor}</h3>
                  <Badge className="border-[#6b6b65] bg-[#1f1d1a] text-stone-100">total {track.totalPrize}</Badge>
                </div>
                <p className="text-xs text-stone-300">
                  Source:{" "}
                  <a
                    href={track.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-[#6b6b65] underline-offset-2 hover:text-stone-100"
                  >
                    official ETHGlobal sponsor page
                  </a>
                </p>
                <div className="overflow-x-auto">
                  <table className="data-table min-w-full text-left text-xs">
                    <thead className="text-stone-300">
                      <tr>
                        <th className="px-2 py-2">Challenge</th>
                        <th className="px-2 py-2">Pool</th>
                        <th className="px-2 py-2">Winner Slots</th>
                        <th className="px-2 py-2">Core Focus</th>
                      </tr>
                    </thead>
                    <tbody>
                      {track.challenges.map((challenge) => (
                        <tr key={`${track.sponsor}-${challenge.title}`} className="border-t border-[#4a4a46]">
                          <td className="px-2 py-2 font-medium">{challenge.title}</td>
                          <td className="px-2 py-2">{challenge.prizePool}</td>
                          <td className="px-2 py-2">{challenge.winnerSlots}</td>
                          <td className="px-2 py-2">{challenge.focus}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </Card>
              ))}
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="data-table min-w-full text-left text-xs">
                <thead className="text-stone-300">
                  <tr>
                    <th className="px-2 py-2">Sponsor</th>
                    <th className="px-2 py-2">Mapped Cases</th>
                    <th className="px-2 py-2">Real Cases</th>
                    <th className="px-2 py-2">Decision-Only Cases</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarioCoverageRows.map((row) => (
                    <tr key={`coverage-${row.sponsor}`} className="border-t border-[#4a4a46]">
                      <td className="px-2 py-2 font-medium">{row.sponsor}</td>
                      <td className="px-2 py-2">{ratioLabel(row.mappedCases, suiteCaseMix.total)}</td>
                      <td className="px-2 py-2">{row.realCases}</td>
                      <td className="px-2 py-2">{row.decisionOnlyCases}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-stone-400">
                Mappings are declared per case via <code>challengeTargets</code> in the suite. This table is not inferred from score outcomes.
              </p>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card className="border-[#4a4a46] bg-soft p-4">
                <p className="text-sm font-semibold text-stone-100">Mapped-case methodology</p>
                <div className="mt-3 overflow-x-auto">
                  <table className="data-table min-w-full text-left text-xs">
                    <thead className="text-stone-300">
                      <tr>
                        <th className="px-2 py-2">Term</th>
                        <th className="px-2 py-2">How it is computed</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-[#4a4a46]">
                        <td className="px-2 py-2 font-medium">Mapped case</td>
                        <td className="px-2 py-2">
                          Scenario includes sponsor in <code>challengeTargets</code> (or explicit source fallback if targets are missing).
                        </td>
                      </tr>
                      <tr className="border-t border-[#4a4a46]">
                        <td className="px-2 py-2 font-medium">Real case</td>
                        <td className="px-2 py-2">
                          <code>executionMode=real</code>. If model passes the gate, the workflow runner executes integration steps.
                        </td>
                      </tr>
                      <tr className="border-t border-[#4a4a46]">
                        <td className="px-2 py-2 font-medium">Decision-only case</td>
                        <td className="px-2 py-2">
                          <code>executionMode=decision_only</code>. No workflow execution; score covers decision correctness and docs grounding only.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="border-[#4a4a46] bg-soft p-4">
                <p className="text-sm font-semibold text-stone-100">Representative sponsor x case-type examples</p>
                <div className="mt-3 overflow-x-auto">
                  <table className="data-table min-w-full text-left text-xs">
                    <thead className="text-stone-300">
                      <tr>
                        <th className="px-2 py-2">Sponsor</th>
                        <th className="px-2 py-2">Case Type</th>
                        <th className="px-2 py-2">Example Case</th>
                        <th className="px-2 py-2">Mapped Challenge(s)</th>
                        <th className="px-2 py-2">Why this case exists</th>
                        <th className="px-2 py-2">How scored</th>
                        <th className="px-2 py-2">Visualize</th>
                      </tr>
                    </thead>
                    <tbody>
                      {methodologyExampleRows.map((row) => (
                        <tr
                          key={`method-${row.sponsor}-${row.caseType}`}
                          className={`border-t border-[#4a4a46] ${
                            row.present && selectedMethodologyRow && methodologyCaseKey(selectedMethodologyRow) === methodologyCaseKey(row)
                              ? "bg-[#24231f]"
                              : ""
                          }`}
                        >
                          <td className="px-2 py-2 font-medium">{row.sponsor}</td>
                          <td className="px-2 py-2">{executionModeText(row.caseType)}</td>
                          <td className="px-2 py-2">
                            {row.present ? (
                              <span>
                                {row.caseName} (<code>{row.caseId}</code>)
                              </span>
                            ) : (
                              <span className="text-stone-400">not present in suite</span>
                            )}
                          </td>
                          <td className="px-2 py-2">{row.mappedChallenges.length ? row.mappedChallenges.join(" | ") : "-"}</td>
                          <td className="px-2 py-2">{row.rationale}</td>
                          <td className="px-2 py-2">
                            {row.present
                              ? row.caseType === "real"
                                ? "Policy+docs scoring plus live workflow execution when gate passes."
                                : "Policy+docs scoring only (no workflow execution)."
                              : row.rationale}
                          </td>
                          <td className="px-2 py-2">
                            {row.present ? (
                              <button
                                type="button"
                                onClick={() => setActiveMethodologyCase(methodologyCaseKey(row))}
                                className={`rounded-full border px-2 py-1 text-[11px] font-semibold transition ${
                                  selectedMethodologyRow && methodologyCaseKey(selectedMethodologyRow) === methodologyCaseKey(row)
                                    ? "border-accent bg-accent/20 text-stone-100"
                                    : "border-[#6b6b65] bg-[#1f1d1a] text-stone-200 hover:border-accent/60 hover:bg-accent/20"
                                }`}
                              >
                                View flow
                              </button>
                            ) : (
                              <span className="text-stone-500">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-stone-400">
                  Rationale source: suite field <code>representativeRationale</code>.
                </p>
              </Card>
            </div>

            <Card className="mt-4 border-[#4a4a46] bg-soft p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-stone-100">Case Flow Visualizer</p>
                  <p className="text-xs text-stone-400">
                    Detailed call path, scoring logic, and observed execution trace for the selected representative case.
                  </p>
                </div>
                {selectedMethodologyRow?.present ? (
                  <div className="flex flex-wrap gap-2">
                    <Badge className="border-[#6b6b65] bg-[#1f1d1a] text-stone-100">{selectedMethodologyRow.sponsor}</Badge>
                    <Badge className="border-[#6b6b65] bg-[#1f1d1a] text-stone-100">{executionModeText(selectedMethodologyRow.caseType)}</Badge>
                    <Badge className="border-[#6b6b65] bg-[#1f1d1a] text-stone-100">
                      {selectedMethodologyRow.caseName} (<code>{selectedMethodologyRow.caseId}</code>)
                    </Badge>
                  </div>
                ) : null}
              </div>

              {!selectedMethodologyRow?.present ? (
                <p className="mt-3 text-sm text-stone-400">Select a representative row with a mapped case to inspect its full flow.</p>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-4 lg:grid-cols-3">
                    <Card className="space-y-2 bg-[#1f1d1a] p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-300">Case Inputs</p>
                      <p className="text-xs text-stone-200">
                        Amount: ${metricLabel(selectedMethodologyRow.scenario?.payment?.amountUsd)} ({metricLabel(selectedMethodologyRow.scenario?.payment?.amountHbar)} HBAR)
                      </p>
                      <p className="text-xs text-stone-200">Destination country: {selectedMethodologyRow.scenario?.payment?.destinationCountry || "-"}</p>
                      <p className="text-xs text-stone-200">Service: {selectedMethodologyRow.scenario?.workflowInput?.service || "-"}</p>
                      <p className="text-xs text-stone-200">Priority: {selectedMethodologyRow.scenario?.workflowInput?.priority || "-"}</p>
                      <p className="text-xs text-stone-200">Retry policy: {selectedMethodologyRow.scenario?.retryPolicy?.retries ?? 0} retries / {selectedMethodologyRow.scenario?.retryPolicy?.delayMs ?? 0} ms</p>
                    </Card>

                    <Card className="space-y-2 bg-[#1f1d1a] p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-300">Expected Policy Output</p>
                      <p className="text-xs text-stone-200">Decision: {selectedMethodologyRow.scenario?.expected?.decision || "-"}</p>
                      <p className="text-xs text-stone-200">Approval required: {String(selectedMethodologyRow.scenario?.expected?.approvalRequired)}</p>
                      <p className="text-xs text-stone-200">Risk level: {selectedMethodologyRow.scenario?.expected?.riskLevel || "-"}</p>
                      <p className="text-xs text-stone-200">Required controls: {joinList(selectedMethodologyRow.scenario?.expected?.requiredControls)}</p>
                      <p className="text-xs text-stone-200">Required source IDs: {joinList(selectedMethodologyRow.scenario?.requiredSources)}</p>
                    </Card>

                    <Card className="space-y-2 bg-[#1f1d1a] p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-300">Scoring + Gate Logic</p>
                      <p className="text-xs text-stone-200">Policy Decision Quality = 55% base field matches + 35% controls F1 + 10% parse validity.</p>
                      <p className="text-xs text-stone-200">Execution Gate (real cases): expected allow + parse OK + decision/approval/priority/risk all match + controls F1 ≥ 60.</p>
                      <p className="text-xs text-stone-200">Docs mode adds required-source coverage and citation-validity checks.</p>
                      <p className="text-xs text-stone-200">
                        Overall (with docs) = 21% base policy + 18% controls F1 + 10% parse + 10% strict match + 11% workflow pass + 12% docs grounded + 9% required-source coverage + 5% citation validity + 4% latency score.
                      </p>
                      <p className="text-xs text-stone-200">
                        Overall (without docs) = 28% base policy + 24% controls F1 + 14% parse + 14% strict match + 15% workflow pass + 5% latency score.
                      </p>
                      <p className="text-xs text-stone-200">Workflow pass rate is computed only on executed scenarios (executed pass / executed total).</p>
                    </Card>
                  </div>

                  <Card className="space-y-3 bg-[#1f1d1a] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-300">Observed Runs For This Case</p>
                      <p className="text-xs text-stone-400">Pick one model/doc-mode run to inspect exact call attempts.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedMethodologyResultRows.map((row) => {
                        const key = methodologyResultKey(row);
                        const mode = resolveResultDocMode(row);
                        return (
                          <button
                            key={`method-result-${selectedMethodologyRow.caseId}-${key}`}
                            type="button"
                            onClick={() => setActiveMethodologyResult(key)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                              activeMethodologyResult === key
                                ? "border-accent bg-accent/20 text-stone-100"
                                : "border-[#6b6b65] bg-[#1f1d1a] text-stone-200 hover:border-accent/60 hover:bg-accent/20"
                            }`}
                          >
                            {row.model} · {docModeLabel(mode)} · attempt {row.attempt}
                          </button>
                        );
                      })}
                    </div>
                    {!selectedMethodologyResultRows.length ? (
                      <p className="text-xs text-stone-400">
                        No benchmark result exists for this case in the latest run. Run benchmark to generate observed traces.
                      </p>
                    ) : null}
                  </Card>

                  {selectedMethodologyResultRow ? (
                    <div className="grid gap-4 lg:grid-cols-2">
                      <Card className="space-y-2 bg-[#1f1d1a] p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-300">Selected Run Outcome</p>
                        <p className="text-xs text-stone-200">
                          Model: {selectedMethodologyResultRow.model} ({docModeLabel(resolveResultDocMode(selectedMethodologyResultRow))})
                        </p>
                        <p className="text-xs text-stone-200">
                          Decision quality: {metricLabel(selectedMethodologyResultRow.evaluation.accuracyPct)}% | Controls F1: {metricLabel(selectedMethodologyResultRow.evaluation.controlsF1Pct)}%
                        </p>
                        <p className="text-xs text-stone-200">
                          Docs coverage: {metricLabel(selectedMethodologyResultRow.evaluation.requiredSourceCoveragePct)}% | Citation validity: {metricLabel(selectedMethodologyResultRow.evaluation.citationValidityPct)}%
                        </p>
                        <p className="text-xs text-stone-200">Execution gate: {selectedMethodologyResultRow.evaluation.executionEligible ? "passed" : "failed"} ({executionGateFailureDetail(selectedMethodologyResultRow)})</p>
                        <p className="text-xs text-stone-200">
                          Workflow status: {normalizeWorkflowStatus(selectedMethodologyResultRow.workflow.status)} | Executed: {selectedMethodologyResultRow.workflow.executed ? "yes" : "no"}
                        </p>
                        <p className="text-xs text-stone-200">Total latency: {metricLabel(selectedMethodologyResultRow.totalLatencyMs)} ms</p>
                        <p className="text-xs text-stone-200">Model reason: {selectedMethodologyResultRow.llm.reason || "no reason text"}</p>
                        <p className="text-xs text-stone-200">Citations: {joinList(selectedMethodologyResultRow.llm.citations ?? [])}</p>
                        <p className="text-xs text-stone-200">Required source hits: {joinList(selectedMethodologyResultRow.evaluation.requiredSourceHits ?? [])}</p>
                      </Card>

                      <Card className="space-y-2 bg-[#1f1d1a] p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-300">Challenge Mapping For This Case</p>
                        <p className="text-xs text-stone-200">
                          {selectedMethodologyRow.mappedChallenges.length
                            ? selectedMethodologyRow.mappedChallenges.join(" | ")
                            : "No mapped challenge labels."}
                        </p>
                        <p className="text-xs text-stone-200">Case rationale: {selectedMethodologyRow.rationale}</p>
                        <p className="text-xs text-stone-200">
                          Context fields:{" "}
                          {selectedMethodologyRow.scenario?.context
                            ? Object.entries(selectedMethodologyRow.scenario.context)
                                .map(([key, value]) => `${key}=${String(value)}`)
                                .join(", ")
                            : "none"}
                        </p>
                        <p className="text-xs text-stone-200">
                          Runner path: LLM inference → evaluation/gate → (if eligible) Ledger policy/approval → Chainlink workflow → Hedera settlement → service probe.
                        </p>
                      </Card>
                    </div>
                  ) : null}

                  {selectedMethodologyResultRow ? (
                    <div className="overflow-x-auto">
                      <table className="data-table min-w-full text-left text-xs">
                        <thead className="text-stone-300">
                          <tr>
                            <th className="px-2 py-2">Stage</th>
                            <th className="px-2 py-2">Attempted</th>
                            <th className="px-2 py-2">Status</th>
                            <th className="px-2 py-2">Duration (ms)</th>
                            <th className="px-2 py-2">Retries</th>
                            <th className="px-2 py-2">Mode</th>
                            <th className="px-2 py-2">Endpoint / Command</th>
                            <th className="px-2 py-2">What We Measure</th>
                            <th className="px-2 py-2">Observed Detail</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedMethodologyTrace.map((step) => (
                            <tr key={`trace-${selectedMethodologyResultRow.model}-${selectedMethodologyResultRow.caseId}-${step.id}`} className="border-t border-[#4a4a46]">
                              <td className="px-2 py-2 font-medium">{step.label}</td>
                              <td className="px-2 py-2">{step.attempted ? "yes" : "no"}</td>
                              <td className={`px-2 py-2 font-semibold ${traceStatusTone(step.status)}`}>{step.status}</td>
                              <td className="px-2 py-2">{metricLabel(step.durationMs)}</td>
                              <td className="px-2 py-2">{step.retriesUsed}</td>
                              <td className="px-2 py-2">{step.mode || "-"}</td>
                              <td className="px-2 py-2">{step.endpoint || "-"}</td>
                              <td className="px-2 py-2">{traceMeasurementFocus(step.id)}</td>
                              <td className="px-2 py-2">{step.detail || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}

                  {selectedMethodologyResultRows.length ? (
                    <div className="overflow-x-auto">
                      <table className="data-table min-w-full text-left text-xs">
                        <thead className="text-stone-300">
                          <tr>
                            <th className="px-2 py-2">Model</th>
                            <th className="px-2 py-2">Doc Mode</th>
                            <th className="px-2 py-2">Policy Quality %</th>
                            <th className="px-2 py-2">Docs Coverage %</th>
                            <th className="px-2 py-2">Gate Eligible</th>
                            <th className="px-2 py-2">Workflow Status</th>
                            <th className="px-2 py-2">Executed</th>
                            <th className="px-2 py-2">Total Latency (ms)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedMethodologyResultRows.map((row) => (
                            <tr key={`case-summary-${row.model}-${resolveResultDocMode(row)}`} className="border-t border-[#4a4a46]">
                              <td className="px-2 py-2 font-medium">{row.model}</td>
                              <td className="px-2 py-2">{docModeLabel(resolveResultDocMode(row))}</td>
                              <td className="px-2 py-2">{metricLabel(row.evaluation.accuracyPct)}</td>
                              <td className="px-2 py-2">{metricLabel(row.evaluation.requiredSourceCoveragePct)}</td>
                              <td className="px-2 py-2">{row.evaluation.executionEligible ? "yes" : "no"}</td>
                              <td className="px-2 py-2">{normalizeWorkflowStatus(row.workflow.status)}</td>
                              <td className="px-2 py-2">{row.workflow.executed ? "yes" : "no"}</td>
                              <td className="px-2 py-2">{metricLabel(row.totalLatencyMs)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              )}
            </Card>
          </Disclosure>
        </section>

      {data?.dataSource?.mode === "fallback" ? (
        <Card className="mb-6 border-amber-300/40 bg-amber-400/10 p-4">
          <p className="text-sm text-amber-100">
            {data.dataSource.message ??
              "Live backend is unavailable. Showing local readiness snapshot so the UI remains usable."}
          </p>
          <p className="mt-2 text-xs text-amber-50/90">
            To switch back to live mode, run backend API: <code>python3 -m pip install -r backend/requirements.txt</code> then{" "}
            <code>npm run api:start</code>.
          </p>
        </Card>
      ) : null}

      {error && !data ? (
        <Card className="mb-6 border-red-400/50 p-4">
          <p className="text-sm text-red-200">
            Failed to load readiness dashboard: {error instanceof Error ? error.message : "Unknown error"}
          </p>
        </Card>
      ) : null}

      <section className="space-y-6">
        <Card className="space-y-6 border-[#4a4a46] bg-panel p-6">
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="runtime-mode" className="text-sm font-medium">
                  Inference runtime
                </label>
                <select
                  id="runtime-mode"
                  value={runtime}
                  onChange={(event) => setRuntime(event.target.value as RuntimeMode)}
                  className="w-full rounded-lg border border-[#4a4a46] bg-soft px-3 py-2 text-sm"
                >
                  <option value="ollama">Ollama (local models)</option>
                  <option value="openai_compat">OpenAI-compatible (HF Router/OpenRouter/Hosted)</option>
                </select>
              </div>

              <Card className="space-y-2 bg-soft p-4">
                <label htmlFor="custom-models" className="text-sm font-medium">
                  Manual model list (comma-separated)
                </label>
                <input
                  id="custom-models"
                  value={customModels}
                  onChange={(event) => setCustomModels(event.target.value)}
                  placeholder="gpt-5.4-mini,gpt-5.4-nano,qwen3:4b-instruct,qwen2.5:0.5b"
                  className="w-full rounded-lg border border-[#4a4a46] bg-soft px-3 py-2 text-sm"
                />
                <p className="text-xs text-stone-400">Effective models: {effectiveModels.length ? effectiveModels.join(", ") : "-"}</p>
                <p className="text-xs text-stone-400">
                  Mixed run is supported: OpenAI models and Ollama local tags can run together in one benchmark.
                </p>
                <p className="text-xs text-stone-400">
                  Detected local Ollama models: {(data?.availableModels ?? []).length ? (data?.availableModels ?? []).join(", ") : "none detected"}
                </p>
              </Card>

              {runtime === "openai_compat" ? (
                <Card className="space-y-3 bg-soft p-4">
                  <div className="space-y-1">
                    <label htmlFor="api-base-url" className="text-sm font-medium">
                      OpenAI-compatible base URL
                    </label>
                    <input
                      id="api-base-url"
                      value={apiBaseUrl}
                      onChange={(event) => setApiBaseUrl(event.target.value)}
                      placeholder={HF_OPENAI_COMPAT_URL}
                      className="w-full rounded-lg border border-[#4a4a46] bg-soft px-3 py-2 text-sm"
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
                      placeholder="OPENAI_API_KEY"
                      className="w-full rounded-lg border border-[#4a4a46] bg-soft px-3 py-2 text-sm"
                    />
                  </div>
                </Card>
              ) : null}

              <Card className="space-y-3 bg-soft p-4">
                <p className="text-sm font-medium">Documentation settings</p>
                <div className="space-y-1">
                  <label htmlFor="docs-pack-path" className="text-sm font-medium">
                    Docs pack path (JSON)
                  </label>
                  <input
                    id="docs-pack-path"
                    value={docsPackPath}
                    onChange={(event) => setDocsPackPath(event.target.value)}
                    placeholder={data?.track.docs?.defaultPackPath ?? "readiness_bench/docs_cache/default_docs_pack.json"}
                    className="w-full rounded-lg border border-[#4a4a46] bg-soft px-3 py-2 text-sm"
                  />
                </div>
                <p className="text-xs text-stone-300">
                  Docs context mode uses full source pages from this pack (all chunks, no top-k truncation).
                </p>
                <label className="flex items-center gap-2 text-sm text-stone-200">
                  <input
                    type="checkbox"
                    checked={requireCitations}
                    onChange={(event) => setRequireCitations(event.target.checked)}
                    className="h-4 w-4 accent-[#6a7448]"
                  />
                  Require citation coverage for passing
                </label>
                <p className="text-xs text-stone-400">
                  Official docs domains: {OFFICIAL_DOC_DOMAINS.join(", ")}
                </p>
              </Card>
            </div>

            <Card className="space-y-4 border-[#4a4a46] bg-soft p-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-stone-100">Run Panel</p>
                <p className="text-xs text-stone-300">Launch one integrated benchmark run (both with-docs and without-docs modes).</p>
              </div>
              <div className="space-y-1">
                <label htmlFor="runs-per-scenario" className="text-sm font-medium">
                  Repeats per scenario
                </label>
                <select
                  id="runs-per-scenario"
                  value={runsPerScenario}
                  onChange={(event) => setRunsPerScenario(Number(event.target.value))}
                  className="w-full rounded-lg border border-[#4a4a46] bg-soft px-3 py-2 text-sm"
                >
                  <option value={1}>1 (fast)</option>
                  <option value={2}>2 (stable)</option>
                  <option value={3}>3 (highest confidence)</option>
                </select>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Comparison lens</p>
                <div className="flex flex-wrap gap-2">
                  {availableDocModes.map((mode) => (
                    <button
                      key={`doc-mode-${mode}`}
                      type="button"
                      onClick={() => setAnalysisDocMode(mode)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        analysisDocMode === mode
                          ? "border-accent bg-accent/20 text-stone-100"
                          : "border-[#6b6b65] bg-[#1f1d1a] text-stone-200 hover:border-accent/60 hover:bg-accent/20"
                      }`}
                    >
                      {docModeLabel(mode)}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-stone-400">
                  Every run scores each model in both modes. This toggle changes which mode you inspect in detail.
                </p>
              </div>

              <Button onClick={handleRun} disabled={running || effectiveModels.length < 2} className="w-full gap-2">
                <RefreshCw size={16} className={running ? "animate-spin" : ""} />
                {running ? "Running benchmark..." : "Run Benchmark"}
              </Button>

              <div className="rounded-lg border border-[#4a4a46] bg-[#1f1d1a] p-3">
                <p className="text-[11px] uppercase tracking-[0.1em] text-stone-400">Run status</p>
                <p className="mt-1 text-xs text-stone-200">{runSummary || "Run status will appear here."}</p>
              </div>

              <div className="space-y-2 text-xs text-stone-300">
                <p className="font-semibold">Run configuration snapshot</p>
                <p>
                  Suite: {data?.track.suiteName || "-"} v{data?.track.suiteVersion || "-"}
                </p>
                {data?.track.suiteReleaseVersion ? (
                  <p>
                    Release: {data.track.suiteReleaseName || "x402Bench"} {data.track.suiteReleaseVersion}
                    {data.track.suiteReleaseUpdatedAt ? ` (${data.track.suiteReleaseUpdatedAt})` : ""}
                  </p>
                ) : null}
                <p>Mocked: {data?.track.mocked === false ? "No" : "Unknown"}</p>
                <p>
                  Cases: {suiteCaseMix.total} total ({suiteCaseMix.real} real, {suiteCaseMix.decisionOnly} decision-only)
                </p>
                <p>Docs modes: {availableDocModes.join(", ")}</p>
                <p>Docs grounding: {data?.track.docs?.enabled ? "On" : "Off"}</p>
                <p>Docs context scope: {(data?.track.docs?.topK ?? 0) === 0 ? "Full source pages (all chunks)" : `Top ${data?.track.docs?.topK} chunks`}</p>
                <p>Integrations ready: {data?.track.integrationStatus?.isFullyConfigured ? "Yes" : "Partial"}</p>
              </div>
            </Card>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="space-y-2 border-[#4a4a46] bg-soft p-4">
              <div className="flex items-center gap-2 text-stone-300">
                <Gauge size={16} /> LLM Readiness Index
              </div>
              <p className={`text-3xl font-semibold ${toneForRate(leader?.overallScore)}`}>{leader ? metricLabel(leader.overallScore) : "-"}</p>
              <p className="text-xs text-stone-400">{leader ? leader.model : "No run data yet"}</p>
            </Card>
            <Card className="space-y-2 border-[#4a4a46] bg-soft p-4">
              <div className="flex items-center gap-2 text-stone-300">
                <Brain size={16} /> Decision Correctness
              </div>
              <p className={`text-3xl font-semibold ${toneForRate(leader?.decisionAccuracyPct)}`}>
                {leader ? metricLabel(leader.decisionAccuracyPct, "%") : "-"}
              </p>
              <p className="text-xs text-stone-400">Decision, approval, priority, risk, and controls quality.</p>
            </Card>
            <Card className="space-y-2 border-[#4a4a46] bg-soft p-4">
              <div className="flex items-center gap-2 text-stone-300">
                <ShieldCheck size={16} /> Live Workflow Pass Rate
              </div>
              <p className={`text-3xl font-semibold ${toneForRate(leader?.workflowSuccessRatePct)}`}>
                {leader ? metricLabel(leader.workflowSuccessRatePct, "%") : "-"}
              </p>
              <p className="text-xs text-stone-400">{leaderExecutionDetail}</p>
            </Card>
            <Card className="space-y-2 border-[#4a4a46] bg-soft p-4">
              <div className="flex items-center gap-2 text-stone-300">
                <Timer size={16} /> Tail Latency (p95)
              </div>
              <p className="text-3xl font-semibold">{leader ? metricLabel(leader.p95TotalLatencyMs, " ms") : "-"}</p>
              <p className="text-xs text-stone-400">End-to-end p95 latency.</p>
            </Card>
          </div>

          <Disclosure
            title="How To Read This Benchmark"
            subtitle="The denominator for each metric is explicit so 0/0, 0%, and 100% are interpretable."
          >
            <div className="overflow-x-auto">
              <table className="data-table min-w-full text-left text-xs">
                <thead className="text-stone-300">
                  <tr>
                    <th className="px-2 py-2">Term</th>
                    <th className="px-2 py-2">Meaning</th>
                    <th className="px-2 py-2">Denominator</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-[#4a4a46]">
                    <td className="px-2 py-2 font-medium">Total cases</td>
                    <td className="px-2 py-2">All scored prompts for the model.</td>
                    <td className="px-2 py-2">All case rows for that model.</td>
                  </tr>
                  <tr className="border-t border-[#4a4a46]">
                    <td className="px-2 py-2 font-medium">Real cases</td>
                    <td className="px-2 py-2">Cases that can trigger live workflow execution.</td>
                    <td className="px-2 py-2">Rows where execution mode is <code>real</code>.</td>
                  </tr>
                  <tr className="border-t border-[#4a4a46]">
                    <td className="px-2 py-2 font-medium">Execution gate pass</td>
                    <td className="px-2 py-2">Model output passed policy requirements to become executable.</td>
                    <td className="px-2 py-2">Usually all cases; additionally shown as real-only count.</td>
                  </tr>
                  <tr className="border-t border-[#4a4a46]">
                    <td className="px-2 py-2 font-medium">Executed pass %</td>
                    <td className="px-2 py-2">Success rate only among executed workflows.</td>
                    <td className="px-2 py-2">Executed workflows only. If no executions, it is 0/0 and displays 0%.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Disclosure>

          <Disclosure
            title="Model Ranking"
            subtitle={`Performance across policy, docs grounding, and execution (${docModeLabel(analysisDocMode)})`}
            defaultOpen
          >
            <div className="overflow-x-auto">
              <table className="data-table min-w-full text-left text-sm">
                <thead className="text-stone-300">
                  <tr>
                    <th className="px-2 py-2">Model</th>
                    <th className="px-2 py-2">Params (Billions)</th>
                    <th className="px-2 py-2">Readiness</th>
                    <th className="px-2 py-2">Policy Quality %</th>
                    <th className="px-2 py-2">Strict Match %</th>
                    <th className="px-2 py-2">Required Docs Coverage %</th>
                    <th className="px-2 py-2">Cases (Real/Decision)</th>
                    <th className="px-2 py-2">Gate Eligible (All)</th>
                    <th className="px-2 py-2">Gate Eligible (Real)</th>
                    <th className="px-2 py-2">Executed Pass %</th>
                    <th className="px-2 py-2">Executed (Pass/Total)</th>
                    <th className="px-2 py-2">Mean E2E Latency (ms)</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedModels.map((row) => {
                    const stats = modelCaseStatsByModel.get(row.model);
                    return (
                      <tr key={row.model} className="border-t border-[#4a4a46]">
                        <td className="px-2 py-2 font-medium">{row.model}</td>
                        <td className="px-2 py-2">{paramsLabel(row.paramsBillions)}</td>
                        <td className="px-2 py-2">{metricLabel(row.overallScore)}</td>
                        <td className="px-2 py-2">{metricLabel(row.decisionAccuracyPct)}</td>
                        <td className="px-2 py-2">{metricLabel(row.fullMatchRatePct)}</td>
                        <td className="px-2 py-2">{metricLabel(row.docsGroundingRatePct)}</td>
                        <td className="px-2 py-2">
                          {stats ? ratioLabel(stats.realCases, stats.decisionOnlyCases) : "-"}
                        </td>
                        <td className="px-2 py-2">
                          {stats ? ratioLabel(stats.eligibleCases, stats.totalCases) : "-"}
                        </td>
                        <td className="px-2 py-2">
                          {stats ? ratioLabel(stats.eligibleRealCases, stats.realCases) : "-"}
                        </td>
                        <td className="px-2 py-2">{metricLabel(row.workflowSuccessRatePct)}</td>
                        <td className="px-2 py-2">{ratioLabel(row.successfulExecutions, row.executedScenarios)}</td>
                        <td className="px-2 py-2">{metricLabel(row.avgTotalLatencyMs)}</td>
                      </tr>
                    );
                  })}
                  {!sortedModels.length && !isLoading ? (
                    <tr>
                      <td className="px-2 py-3 text-stone-400" colSpan={12}>
                        No readiness benchmark results yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Disclosure>

          <Disclosure
            title="Docs Context Impact"
            subtitle="Per-model delta between With Docs Context and Without Docs Context."
            defaultOpen
          >
            <div className="overflow-x-auto">
              <table className="data-table min-w-full text-left text-sm">
                <thead className="text-stone-300">
                  <tr>
                    <th className="px-2 py-2">Model</th>
                    <th className="px-2 py-2">Params</th>
                    <th className="px-2 py-2">With Docs Score</th>
                    <th className="px-2 py-2">Without Docs Score</th>
                    <th className="px-2 py-2">Delta Score</th>
                    <th className="px-2 py-2">With Docs Decision %</th>
                    <th className="px-2 py-2">Without Docs Decision %</th>
                    <th className="px-2 py-2">Delta Decision %</th>
                    <th className="px-2 py-2">With Docs Workflow %</th>
                    <th className="px-2 py-2">Without Docs Workflow %</th>
                  </tr>
                </thead>
                <tbody>
                  {modelComparisons.map((row) => (
                    <tr key={`docs-impact-${row.model}`} className="border-t border-[#4a4a46]">
                      <td className="px-2 py-2 font-medium">{row.model}</td>
                      <td className="px-2 py-2">{paramsLabel(row.paramsBillions)}</td>
                      <td className="px-2 py-2">{metricLabel(row.withDocs?.overallScore)}</td>
                      <td className="px-2 py-2">{metricLabel(row.withoutDocs?.overallScore)}</td>
                      <td className={`px-2 py-2 font-semibold ${toneForRate(row.deltaOverallScore ?? undefined)}`}>
                        {metricLabel(row.deltaOverallScore ?? undefined)}
                      </td>
                      <td className="px-2 py-2">{metricLabel(row.withDocs?.decisionAccuracyPct)}</td>
                      <td className="px-2 py-2">{metricLabel(row.withoutDocs?.decisionAccuracyPct)}</td>
                      <td className={`px-2 py-2 font-semibold ${toneForRate(row.deltaDecisionAccuracyPct ?? undefined)}`}>
                        {metricLabel(row.deltaDecisionAccuracyPct ?? undefined)}
                      </td>
                      <td className="px-2 py-2">{metricLabel(row.withDocs?.workflowSuccessRatePct)}</td>
                      <td className="px-2 py-2">{metricLabel(row.withoutDocs?.workflowSuccessRatePct)}</td>
                    </tr>
                  ))}
                  {!modelComparisons.length && !isLoading ? (
                    <tr>
                      <td className="px-2 py-3 text-stone-400" colSpan={10}>
                        No dual-mode comparison rows yet. Run the benchmark to populate with/without docs deltas.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Disclosure>

          <Disclosure
            title="Sponsor Track Breakdown"
            subtitle={`Per-sponsor model performance on policy, docs, and execution (${docModeLabel(analysisDocMode)})`}
            defaultOpen
          >
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSponsorShowAllModels(true)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    sponsorShowAllModels
                      ? "border-accent bg-accent/20 text-stone-100"
                      : "border-[#6b6b65] bg-[#1f1d1a] text-stone-200 hover:border-accent/60 hover:bg-accent/20"
                  }`}
                >
                  All models
                </button>
                {sortedModels.map((row) => (
                  <button
                    key={`sponsor-filter-${row.model}`}
                    type="button"
                    onClick={() => {
                      setActiveModel(row.model);
                      setSponsorShowAllModels(false);
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      !sponsorShowAllModels && activeModel === row.model
                        ? "border-accent bg-accent/20 text-stone-100"
                        : "border-[#6b6b65] bg-[#1f1d1a] text-stone-200 hover:border-accent/60 hover:bg-accent/20"
                    }`}
                  >
                    {row.model}
                  </button>
                ))}
              </div>

              {sponsorVisibleModels.map((modelRow) => {
                const rows = sponsorBreakdownByModel.get(modelRow.model) ?? [];
                return (
                  <Card key={modelRow.model} className="bg-soft p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge className="border-[#6b6b65] bg-[#1f1d1a] text-stone-100">{modelRow.model}</Badge>
                      <Badge className="border-[#6b6b65] bg-[#1f1d1a] text-stone-100">overall {metricLabel(modelRow.overallScore)}</Badge>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="data-table min-w-full text-left text-xs">
                        <thead className="text-stone-300">
                          <tr>
                            <th className="px-2 py-2">Sponsor</th>
                            <th className="px-2 py-2">Cases (Real/Decision)</th>
                            <th className="px-2 py-2">
                              <MetricHeader
                                label="Policy Quality %"
                                help="Average case-level policy quality for this sponsor: decision, approval, priority, risk, and controls correctness."
                              />
                            </th>
                            <th className="px-2 py-2">
                              <MetricHeader
                                label="Docs Coverage %"
                                help="Share of sponsor-scoped cases where required documentation was correctly grounded and cited."
                              />
                            </th>
                            <th className="px-2 py-2">
                              <MetricHeader
                                label="Gate Eligible (All)"
                                help="Cases where the model output passed the execution gate out of all sponsor-scoped cases."
                              />
                            </th>
                            <th className="px-2 py-2">
                              <MetricHeader
                                label="Gate Eligible (Real)"
                                help="Real execution cases that passed gate checks and became executable."
                              />
                            </th>
                            <th className="px-2 py-2">
                              <MetricHeader
                                label="Executed (Pass/Total)"
                                help="Only workflows that actually executed. 0/0 means no real case reached execution."
                              />
                            </th>
                            <th className="px-2 py-2">
                              <MetricHeader
                                label="Executed Pass %"
                                help="Success rate among executed workflows only."
                              />
                            </th>
                            <th className="px-2 py-2">
                              <MetricHeader
                                label="Sponsor Score"
                                help="Weighted score = 50% Policy Quality + 30% Docs Coverage + 20% execution signal (executed pass rate if executions exist; else gate eligibility)."
                              />
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr key={`${modelRow.model}-${row.sponsor}`} className="border-t border-[#4a4a46]">
                              <td className="px-2 py-2 font-medium">{row.sponsor}</td>
                              <td className="px-2 py-2">{ratioLabel(row.realCases, row.decisionOnlyCases)}</td>
                              <td className="px-2 py-2">{metricLabel(row.decisionAccuracyPct)}</td>
                              <td className="px-2 py-2">{metricLabel(row.docsGroundedPct)}</td>
                              <td className="px-2 py-2">{ratioLabel(row.eligibleCases, row.totalCases)}</td>
                              <td className="px-2 py-2">{ratioLabel(row.eligibleRealCases, row.realCases)}</td>
                              <td className="px-2 py-2">{ratioLabel(row.successfulExecutions, row.executedCases)}</td>
                              <td className="px-2 py-2">{metricLabel(row.executedPassPct)}</td>
                              <td className={`px-2 py-2 font-semibold ${toneForRate(row.sponsorScore)}`}>{metricLabel(row.sponsorScore)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                );
              })}
              {!sponsorVisibleModels.length && !isLoading ? (
                <p className="text-sm text-stone-400">Run the benchmark to populate sponsor-track breakdown.</p>
              ) : null}
            </div>
          </Disclosure>
        </Card>

        <Card className="space-y-5 border-[#4a4a46] bg-panel p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Model Inspection</h2>
              <p className="text-sm text-stone-300">
                Select one model to inspect scenario outcomes and sponsor-track results ({docModeLabel(analysisDocMode)}).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {sortedModels.map((row) => (
              <button
                key={row.model}
                type="button"
                onClick={() => {
                  setActiveModel(row.model);
                  setSponsorShowAllModels(false);
                }}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  activeModel === row.model
                    ? "border-accent bg-accent/20 text-stone-100"
                    : "border-[#6b6b65] bg-[#1f1d1a] text-stone-200 hover:border-accent/60 hover:bg-accent/20"
                }`}
              >
                {row.model} ({paramsLabel(row.paramsBillions)})
              </button>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Card className="space-y-1 bg-soft p-4">
              <p className="text-xs uppercase tracking-wide text-stone-400">LLM Readiness Index</p>
              <p className={`text-2xl font-semibold ${toneForRate(activeModelRow?.overallScore)}`}>
                {metricLabel(activeModelRow?.overallScore)}
              </p>
            </Card>
            <Card className="space-y-1 bg-soft p-4">
              <p className="text-xs uppercase tracking-wide text-stone-400">Decision Correctness</p>
              <p className={`text-2xl font-semibold ${toneForRate(activeModelRow?.decisionAccuracyPct)}`}>
                {metricLabel(activeModelRow?.decisionAccuracyPct, "%")}
              </p>
            </Card>
            <Card className="space-y-1 bg-soft p-4">
              <p className="text-xs uppercase tracking-wide text-stone-400">Live Workflow Pass</p>
              <p className={`text-2xl font-semibold ${toneForRate(activeModelRow?.workflowSuccessRatePct)}`}>
                {metricLabel(activeModelRow?.workflowSuccessRatePct, "%")}
              </p>
              <p className="text-xs text-stone-400">
                {activeModelCaseStats
                  ? `Executed ${ratioLabel(activeModelCaseStats.successfulExecutions, activeModelCaseStats.executedCases)} | Eligible real ${ratioLabel(activeModelCaseStats.eligibleRealCases, activeModelCaseStats.realCases)}`
                  : "-"}
              </p>
            </Card>
            <Card className="space-y-1 bg-soft p-4">
              <p className="text-xs uppercase tracking-wide text-stone-400">Mean E2E Latency</p>
              <p className="text-2xl font-semibold">{metricLabel(activeModelRow?.avgTotalLatencyMs, " ms")}</p>
            </Card>
          </div>

          <Disclosure title="Selected Model Sponsor Breakdown" subtitle="How this model performs per sponsor track" defaultOpen>
            <div className="overflow-x-auto">
              <table className="data-table min-w-full text-left text-sm">
                <thead className="text-stone-300">
                  <tr>
                    <th className="px-2 py-2">Sponsor</th>
                    <th className="px-2 py-2">Cases (Real/Decision)</th>
                    <th className="px-2 py-2">
                      <MetricHeader
                        label="Policy Quality %"
                        help="Average case-level policy quality for this sponsor: decision, approval, priority, risk, and controls correctness."
                      />
                    </th>
                    <th className="px-2 py-2">
                      <MetricHeader
                        label="Docs Coverage %"
                        help="Share of sponsor-scoped cases where required documentation was correctly grounded and cited."
                      />
                    </th>
                    <th className="px-2 py-2">
                      <MetricHeader
                        label="Gate Eligible (All)"
                        help="Cases where the model output passed the execution gate out of all sponsor-scoped cases."
                      />
                    </th>
                    <th className="px-2 py-2">
                      <MetricHeader
                        label="Gate Eligible (Real)"
                        help="Real execution cases that passed gate checks and became executable."
                      />
                    </th>
                    <th className="px-2 py-2">
                      <MetricHeader
                        label="Executed (Pass/Total)"
                        help="Only workflows that actually executed. 0/0 means no real case reached execution."
                      />
                    </th>
                    <th className="px-2 py-2">
                      <MetricHeader
                        label="Executed Pass %"
                        help="Success rate among executed workflows only."
                      />
                    </th>
                    <th className="px-2 py-2">
                      <MetricHeader
                        label="Sponsor Score"
                        help="Weighted score = 50% Policy Quality + 30% Docs Coverage + 20% execution signal (executed pass rate if executions exist; else gate eligibility)."
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activeModelSponsorRows.map((row) => (
                    <tr key={`${activeModel}-${row.sponsor}`} className="border-t border-[#4a4a46]">
                      <td className="px-2 py-2 font-medium">{row.sponsor}</td>
                      <td className="px-2 py-2">{ratioLabel(row.realCases, row.decisionOnlyCases)}</td>
                      <td className="px-2 py-2">{metricLabel(row.decisionAccuracyPct)}</td>
                      <td className="px-2 py-2">{metricLabel(row.docsGroundedPct)}</td>
                      <td className="px-2 py-2">{ratioLabel(row.eligibleCases, row.totalCases)}</td>
                      <td className="px-2 py-2">{ratioLabel(row.eligibleRealCases, row.realCases)}</td>
                      <td className="px-2 py-2">{ratioLabel(row.successfulExecutions, row.executedCases)}</td>
                      <td className="px-2 py-2">{metricLabel(row.executedPassPct)}</td>
                      <td className={`px-2 py-2 font-semibold ${toneForRate(row.sponsorScore)}`}>{metricLabel(row.sponsorScore)}</td>
                    </tr>
                  ))}
                  {!activeModelSponsorRows.length ? (
                    <tr>
                      <td className="px-2 py-3 text-stone-400" colSpan={9}>
                        No sponsor breakdown for selected model yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Disclosure>

          <Disclosure
            title="Selected Model Scenario Audit"
            subtitle={`Case-by-case pass/fail with human-readable explanations (${docModeLabel(analysisDocMode)})`}
            defaultOpen
          >
            <div className="space-y-4">
              {activeModelCaseRows.map((row) => {
                const checklist = buildHumanTaskChecklist(row);
                const passedCount = checklist.filter((item) => item.passed).length;
                const scenario = scenarioById.get(row.caseId) || scenarioById.get(row.scenarioId);
                const sponsors = caseSponsors(scenario, row.executionMode);
                const challengeTargets = Array.isArray(scenario?.challengeTargets) ? scenario.challengeTargets : [];
                return (
                  <Card key={`${row.model}-${row.caseId}`} className="border-[#4a4a46] bg-soft p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                      <Badge className="border-[#6b6b65] bg-[#1f1d1a] text-stone-100">{row.caseName}</Badge>
                      <Badge className="border-[#6b6b65] bg-[#1f1d1a] text-stone-100">
                        {docModeLabel((row.docMode ?? (row.docs?.enabled ? "with_docs" : "without_docs")) as DocMode)}
                      </Badge>
                      <Badge className={`border ${statusChipTone(row.workflow.status)}`}>{normalizeWorkflowStatus(row.workflow.status)}</Badge>
                      <Badge className="border-[#6b6b65] bg-[#1f1d1a] text-stone-100">tasks passed: {passedCount}/{checklist.length}</Badge>
                      <Badge className="border-[#6b6b65] bg-[#1f1d1a] text-stone-100">latency: {metricLabel(row.totalLatencyMs)} ms</Badge>
                      {sponsors.map((sponsor) => (
                        <Badge key={`${row.caseId}-${sponsor}`} className="border-[#6b6b65] bg-[#1f1d1a] text-stone-100">
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
                          <p className="flex items-center gap-2 font-medium text-stone-100">
                            {task.passed ? <CheckCircle2 size={14} className="text-emerald-200" /> : <XCircle size={14} className="text-rose-200" />}
                            {task.label}: {passLabel(task.passed)}
                          </p>
                          <p className="mt-1 text-xs text-stone-100/90">{task.detail}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 space-y-1 text-xs text-stone-400">
                      <p>Execution mode: {row.executionMode === "real" ? "real workflow case" : "decision-only case"}</p>
                      <p>Execution gate detail: {executionGateFailureDetail(row)}</p>
                      <p>Representative rationale: {scenario?.representativeRationale || "no rationale annotated in suite"}</p>
                      <p>
                        Challenge targets:{" "}
                        {challengeTargets.length
                          ? challengeTargets.map((item) => `${item.sponsor}: ${item.challenge}`).join(" | ")
                          : "not declared"}
                      </p>
                      <p>Required docs sources: {joinList(row.docs.requiredSources ?? [])}</p>
                      <p>Model reason: {row.llm.reason || "no reason text"}</p>
                      <p>Citation IDs: {joinList(row.llm.citations ?? [])}</p>
                      <p>Model output preview: {row.llm.rawOutputPreview || "n/a"}</p>
                    </div>
                  </Card>
                );
              })}
              {!activeModelCaseRows.length && !isLoading ? (
                <p className="text-sm text-stone-400">Run the benchmark to generate model-level task audit rows.</p>
              ) : null}
            </div>
          </Disclosure>
        </Card>

        <Card className="space-y-4 border-[#4a4a46] bg-panel p-6">
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
                      <div key={item.integration} className="rounded-lg border border-amber-200/20 bg-[#1f1d1a] px-3 py-2">
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

              <Card className="bg-soft p-4">
                <p className="mb-2 text-sm font-semibold">Environment snippet</p>
                <pre className="overflow-auto rounded-lg bg-[#1f1d1a] p-3 text-[11px] leading-5 text-stone-100">{envSnippet}</pre>
              </Card>
            </div>
          </Disclosure>

          {runTechnicalLog ? (
            <Disclosure title="Technical Logs" subtitle="Raw run output for debugging">
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-soft p-3 text-[11px] leading-4 text-stone-200">
                {runTechnicalLog}
              </pre>
            </Disclosure>
          ) : null}
        </Card>
      </section>
    </main>
  );
}
