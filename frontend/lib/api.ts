const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
const READINESS_FALLBACK_PATH = "/readiness-dashboard-fallback.json";
const READINESS_TIMEOUT_MS = 5000;
export type DocMode = "with_docs" | "without_docs";

export interface RunResponse {
  ok: boolean;
  returnCode: number;
  stdout: string;
  stderr: string;
  runId?: string | null;
  durationMs?: number;
}

export interface HealthResponse {
  status: string;
  workflowRunInProgress: boolean;
  llmRunInProgress: boolean;
  readinessRunInProgress: boolean;
  workflowTimeoutSeconds: number;
  llmTimeoutSeconds: number;
  readinessTimeoutSeconds: number;
}

export interface DashboardResponse {
  project: {
    name: string;
    tagline: string;
    sponsors: string[];
  };
  benchmarkDefinition: {
    workflow: {
      name: string;
      whatIsBenchmarked: string;
      mocked: boolean;
      suiteId?: string | null;
      suiteName?: string | null;
      scenarioCount: number;
      statusNote: string;
      integrationStatus: {
        isFullyConfigured: boolean;
        hedera: { mode: string; configured: boolean; reason: string };
        chainlink: { mode: string; configured: boolean; reason: string };
        ledger: { mode: string; configured: boolean; reason: string };
        serviceProbe: { configured: boolean; reason: string };
      };
    };
    llm: {
      name: string;
      whatIsBenchmarked: string;
      mocked: boolean;
    };
  };
  latest: {
    runId: string;
    suite: string;
    startedAt: string;
    finishedAt: string;
    overallScore: number;
    reliabilityScore: number;
    latencyScore: number;
    safetyScore: number;
    resilienceScore: number;
    successful: number;
    failed: number;
    totalScenarios: number;
    successRate: number;
    failureRate: number;
    retries: number;
    p95TotalMs: number;
  } | null;
  scenarios: Array<{
    id: string;
    name: string;
    status: string;
    durationMs: number;
    notes: string[];
  }>;
}

export interface LlmDashboardResponse {
  track: {
    name: string;
    mocked: boolean;
    runtime: string;
    suiteName: string;
    suitePath: string;
    tasks: Array<{ id: string; name: string }>;
  };
  availableModels: string[];
  recommendedModels: string[];
  latest: {
    runId: string;
    startedAt: string;
    finishedAt: string;
    taskCount: number;
    runsPerTask: number;
    models: string[];
  } | null;
  models: Array<{
    model: string;
    avgLatencyMs: number;
    p95LatencyMs: number;
    avgCoveragePct: number;
    successRatePct: number;
  }>;
}

export interface ReadinessDashboardResponse {
  dataSource?: {
    mode: "live" | "fallback";
    message?: string;
    backendBaseUrl?: string;
  };
  project: {
    name: string;
    tagline: string;
    sponsors: string[];
  };
  track: {
    name: string;
    whatIsBenchmarked: string;
    mocked: boolean;
    suiteName: string;
    suiteVersion: string;
    suiteReleaseName?: string | null;
    suiteReleaseVersion?: string | null;
    suiteReleaseUpdatedAt?: string | null;
    suitePath: string;
    scenarioCount: number;
    runtimeUsed: string;
    supportedRuntimes: string[];
    docs: {
      defaultPackAvailable: boolean;
      defaultPackPath: string | null;
      enabled: boolean;
      modes?: DocMode[];
      name?: string | null;
      version?: string | null;
      sourceCount: number;
      topK: number;
      requireCitations: boolean;
    };
    prompt?: {
      overrideEnabled?: boolean;
      overridePreview?: string | null;
    };
    statusNote: string;
    integrationStatus: {
      isFullyConfigured: boolean;
      hedera: { mode: string; configured: boolean; reason: string };
      chainlink: { mode: string; configured: boolean; reason: string };
      ledger: { mode: string; configured: boolean; reason: string };
      serviceProbe: { configured: boolean; reason: string };
    };
  };
  availableModels: string[];
  recommendedModels: string[];
  latest: {
    runId: string;
    startedAt: string;
    finishedAt: string;
    scenarioCount: number;
    runsPerScenario: number;
    runtime: string;
    suiteName: string;
    suiteVersion: string;
    models: string[];
    docs: {
      enabled?: boolean;
      modes?: DocMode[];
      path?: string | null;
      name?: string | null;
      version?: string | null;
      sourceCount?: number;
      topK?: number;
      requireCitations?: boolean;
    };
    docsModes?: DocMode[];
    totalEvaluations: number;
  } | null;
  models: Array<{
    model: string;
    paramsBillions: number | null;
    overallScore: number;
    decisionAccuracyPct: number;
    basePolicyAccuracyPct: number;
    controlsF1Pct: number;
    parseRatePct: number;
    fullMatchRatePct: number;
    docsGroundingRatePct: number;
    citationValidityPct: number;
    requiredSourceCoveragePct: number;
    executionEligibilityPct: number;
    workflowSuccessRatePct: number;
    executedScenarios: number;
    successfulExecutions: number;
    failedExecutions: number;
    avgTotalLatencyMs: number;
    p95TotalLatencyMs: number;
    totalEvaluations: number;
    expectedEvaluations: number;
  }>;
  modelsByDocMode?: {
    with_docs: Array<{
      model: string;
      paramsBillions: number | null;
      overallScore: number;
      decisionAccuracyPct: number;
      basePolicyAccuracyPct: number;
      controlsF1Pct: number;
      parseRatePct: number;
      fullMatchRatePct: number;
      docsGroundingRatePct: number;
      citationValidityPct: number;
      requiredSourceCoveragePct: number;
      executionEligibilityPct: number;
      workflowSuccessRatePct: number;
      executedScenarios: number;
      successfulExecutions: number;
      failedExecutions: number;
      avgTotalLatencyMs: number;
      p95TotalLatencyMs: number;
      totalEvaluations: number;
      expectedEvaluations: number;
    }>;
    without_docs: Array<{
      model: string;
      paramsBillions: number | null;
      overallScore: number;
      decisionAccuracyPct: number;
      basePolicyAccuracyPct: number;
      controlsF1Pct: number;
      parseRatePct: number;
      fullMatchRatePct: number;
      docsGroundingRatePct: number;
      citationValidityPct: number;
      requiredSourceCoveragePct: number;
      executionEligibilityPct: number;
      workflowSuccessRatePct: number;
      executedScenarios: number;
      successfulExecutions: number;
      failedExecutions: number;
      avgTotalLatencyMs: number;
      p95TotalLatencyMs: number;
      totalEvaluations: number;
      expectedEvaluations: number;
    }>;
  };
  modelComparisons?: Array<{
    model: string;
    paramsBillions: number | null;
    withDocs: ReadinessDashboardResponse["models"][number] | null;
    withoutDocs: ReadinessDashboardResponse["models"][number] | null;
    deltaOverallScore: number | null;
    deltaDecisionAccuracyPct: number | null;
    deltaWorkflowSuccessRatePct: number | null;
    deltaDocsGroundingRatePct: number | null;
  }>;
  results: Array<{
    model: string;
    docMode?: DocMode;
    caseId: string;
    caseName: string;
    executionMode: "real" | "decision_only";
    scenarioId: string;
    scenarioName: string;
    attempt: number;
    expected: {
      decision: string;
      approvalRequired: boolean;
      priority: string;
      riskLevel: string;
      requiredControls: string[];
    };
    llm: {
      parseOk: boolean;
      decision: string;
      approvalRequired: boolean | null;
      priority: string;
      riskLevel: string;
      requiredControls: string[];
      citations: string[];
      reason: string;
      latencyMs: number;
      error: string | null;
      rawOutputPreview: string;
    };
    docs: {
      enabled: boolean;
      requiredSources: string[];
      providedExcerptIds: string[];
      providedSourceIds: string[];
    };
    evaluation: {
      decisionMatch: boolean;
      approvalMatch: boolean;
      priorityMatch: boolean;
      riskMatch: boolean;
      fullMatch: boolean;
      basePolicyAccuracyPct: number;
      controlsF1Pct: number;
      citationCount: number;
      validCitationCount: number;
      citationValidityPct: number;
      requiredSourceCoveragePct: number;
      requiredSourceHits: string[];
      docsGrounded: boolean;
      accuracyPct: number;
      executionEligible: boolean;
    };
    executionGateFailures: string[];
    workflow: {
      executed: boolean;
      status: string;
      retryCount: number;
      txHash: string | null;
      workflowId: string | null;
      durationMs: number;
      durationBreakdownMs?: {
        ledger?: number;
        chainlink?: number;
        hedera?: number;
        serviceProbe?: number;
        total?: number;
      };
      notes: string[];
      trace?: Array<{
        id: string;
        label: string;
        attempted: boolean;
        status: string;
        durationMs: number;
        retriesUsed: number;
        mode?: string | null;
        endpoint?: string | null;
        detail?: string | null;
      }>;
    };
    totalLatencyMs: number;
  }>;
  scenarios: Array<{
    id: string;
    name: string;
    executionMode: string;
    representativeRationale?: string;
    payment: {
      amountUsd: number;
      amountHbar?: number;
      recipientAccountId?: string;
      destinationCountry: string;
    };
    workflowInput?: {
      service?: string;
      priority?: string;
    };
    retryPolicy?: {
      retries?: number;
      delayMs?: number;
    };
    context?: Record<string, string | number | boolean>;
    expected: {
      decision: string;
      approvalRequired: boolean;
      priority: string;
      riskLevel: string;
      requiredControls: string[];
    };
    requiredSources: string[];
    challengeTargets?: Array<{
      sponsor: string;
      challenge: string;
    }>;
  }>;
}

export async function fetchDashboard(): Promise<DashboardResponse> {
  const response = await fetch(`${API_BASE}/api/v1/dashboard`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Dashboard request failed with status ${response.status}`);
  }
  return (await response.json()) as DashboardResponse;
}

export async function fetchLlmDashboard(): Promise<LlmDashboardResponse> {
  const response = await fetch(`${API_BASE}/api/v1/llm/dashboard`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`LLM dashboard request failed with status ${response.status}`);
  }
  return (await response.json()) as LlmDashboardResponse;
}

export async function fetchReadinessDashboard(): Promise<ReadinessDashboardResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), READINESS_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}/api/v1/readiness/dashboard`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Readiness dashboard request failed with status ${response.status}`);
    }
    const payload = (await response.json()) as ReadinessDashboardResponse;
    return {
      ...payload,
      dataSource: {
        mode: "live",
        backendBaseUrl: API_BASE,
      },
    };
  } catch (primaryError) {
    const primaryMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);
    const fallbackResponse = await fetch(READINESS_FALLBACK_PATH, { cache: "no-store" });
    if (!fallbackResponse.ok) {
      throw new Error(
        `Readiness dashboard unavailable. Live API (${API_BASE}) failed (${primaryMessage}) and fallback snapshot is missing.`,
      );
    }
    const fallbackPayload = (await fallbackResponse.json()) as ReadinessDashboardResponse;
    return {
      ...fallbackPayload,
      dataSource: {
        mode: "fallback",
        backendBaseUrl: API_BASE,
        message: `Live backend unavailable (${primaryMessage}). Showing local snapshot.`,
      },
      track: {
        ...fallbackPayload.track,
        statusNote: `Live backend unavailable (${primaryMessage}). Showing local snapshot from readiness artifacts.`,
      },
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function responseErrorText(response: Response): Promise<string> {
  try {
    const text = (await response.text()).trim();
    if (!text) return "";
    try {
      const parsed = JSON.parse(text) as { detail?: unknown; message?: unknown };
      if (typeof parsed?.detail === "string" && parsed.detail.trim()) return parsed.detail.trim();
      if (typeof parsed?.message === "string" && parsed.message.trim()) return parsed.message.trim();
    } catch {
      // Not JSON; return the raw body.
    }
    return text;
  } catch {
    return "";
  }
}

function idempotencyKey(prefix: string): string {
  const rand = Math.random().toString(16).slice(2);
  const uuid = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${rand}`;
  return `${prefix}-${uuid}`;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/health`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Health request failed with status ${response.status}`);
  }
  return (await response.json()) as HealthResponse;
}

export async function runBenchmark(strict: boolean): Promise<RunResponse> {
  const response = await fetch(`${API_BASE}/api/v1/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey("workflow"),
    },
    body: JSON.stringify({ strict }),
  });
  if (!response.ok) {
    const message = await responseErrorText(response);
    throw new Error(
      message ? `Run request failed with status ${response.status}: ${message}` : `Run request failed with status ${response.status}`,
    );
  }
  return (await response.json()) as RunResponse;
}

export async function runReadinessBenchmark(input: {
  models: string[];
  runtime: "openai_compat";
  apiBaseUrl?: string;
  apiKeyEnv?: string;
  docsPackPath?: string;
  docsTopK?: number;
  requireCitations?: boolean;
  promptOverride?: string;
  runsPerScenario: number;
  maxTokens: number;
  temperature: number;
}): Promise<RunResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/v1/readiness/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey("readiness"),
      },
      body: JSON.stringify(input),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot reach readiness API at ${API_BASE}. Start backend API first (npm run api:start). Original error: ${message}`,
    );
  }
  if (!response.ok) {
    const message = await responseErrorText(response);
    throw new Error(
      message
        ? `Readiness run request failed with status ${response.status}: ${message}`
        : `Readiness run request failed with status ${response.status}`,
    );
  }
  return (await response.json()) as RunResponse;
}

export async function runLlmBenchmark(input: {
  models: string[];
  runsPerTask: number;
  maxTokens: number;
  temperature: number;
}): Promise<RunResponse> {
  const response = await fetch(`${API_BASE}/api/v1/llm/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey("llm"),
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const message = await responseErrorText(response);
    throw new Error(
      message ? `LLM run request failed with status ${response.status}: ${message}` : `LLM run request failed with status ${response.status}`,
    );
  }
  return (await response.json()) as RunResponse;
}
