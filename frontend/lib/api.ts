const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export interface RunResponse {
  ok: boolean;
  returnCode: number;
  stdout: string;
  stderr: string;
  runId?: string | null;
  durationMs?: number;
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
  project: {
    name: string;
    tagline: string;
    sponsors: string[];
  };
  track: {
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
  availableModels: string[];
  recommendedModels: string[];
  latest: {
    runId: string;
    startedAt: string;
    finishedAt: string;
    scenarioCount: number;
    runsPerScenario: number;
    models: string[];
    totalEvaluations: number;
  } | null;
  models: Array<{
    model: string;
    overallScore: number;
    decisionAccuracyPct: number;
    fullMatchRatePct: number;
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
  results: Array<{
    model: string;
    scenarioId: string;
    scenarioName: string;
    attempt: number;
    expected: {
      allow: boolean;
      approvalRequired: boolean;
      priority: string;
    };
    llm: {
      parseOk: boolean;
      decision: string;
      approvalRequired: boolean | null;
      priority: string;
      reason: string;
      latencyMs: number;
      error: string | null;
      rawOutputPreview: string;
    };
    evaluation: {
      decisionMatch: boolean;
      approvalMatch: boolean;
      priorityMatch: boolean;
      fullMatch: boolean;
      accuracyPct: number;
      executionEligible: boolean;
    };
    workflow: {
      executed: boolean;
      status: string;
      retryCount: number;
      txHash: string | null;
      workflowId: string | null;
      durationMs: number;
      notes: string[];
    };
    totalLatencyMs: number;
  }>;
  scenarios: Array<{
    id: string;
    name: string;
    expected: {
      allow: boolean;
      approvalRequired: boolean;
      priority: string;
    };
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
  const response = await fetch(`${API_BASE}/api/v1/readiness/dashboard`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Readiness dashboard request failed with status ${response.status}`);
  }
  return (await response.json()) as ReadinessDashboardResponse;
}

export async function runBenchmark(strict: boolean): Promise<RunResponse> {
  const response = await fetch(`${API_BASE}/api/v1/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ strict }),
  });
  if (!response.ok) {
    throw new Error(`Run request failed with status ${response.status}`);
  }
  return (await response.json()) as RunResponse;
}

export async function runReadinessBenchmark(input: {
  models: string[];
  runsPerScenario: number;
  maxTokens: number;
  temperature: number;
}): Promise<RunResponse> {
  const response = await fetch(`${API_BASE}/api/v1/readiness/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Readiness run request failed with status ${response.status}: ${message}`);
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`LLM run request failed with status ${response.status}: ${message}`);
  }
  return (await response.json()) as RunResponse;
}
