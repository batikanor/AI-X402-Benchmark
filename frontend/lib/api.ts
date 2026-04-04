const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export interface DashboardResponse {
  project: {
    name: string;
    tagline: string;
    sponsors: string[];
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

export async function fetchDashboard(): Promise<DashboardResponse> {
  const response = await fetch(`${API_BASE}/api/v1/dashboard`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Dashboard request failed with status ${response.status}`);
  }
  return (await response.json()) as DashboardResponse;
}

export async function runBenchmark(strict: boolean): Promise<{ ok: boolean; returnCode: number; stdout: string; stderr: string }> {
  const response = await fetch(`${API_BASE}/api/v1/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ strict }),
  });
  if (!response.ok) {
    throw new Error(`Run request failed with status ${response.status}`);
  }
  return (await response.json()) as { ok: boolean; returnCode: number; stdout: string; stderr: string };
}
