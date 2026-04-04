"use client";

import { useMemo, useState } from "react";
import { Activity, AlertTriangle, Gauge, RefreshCw, ShieldCheck, Timer } from "lucide-react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchDashboard, runBenchmark } from "@/lib/api";

function metricLabel(value: number | undefined, suffix = ""): string {
  if (value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return `${value.toFixed(2)}${suffix}`;
}

export default function HomePage() {
  const { data, error, isLoading, mutate } = useSWR("dashboard", fetchDashboard, { refreshInterval: 15000 });
  const [running, setRunning] = useState(false);
  const [strict, setStrict] = useState(false);
  const [runLog, setRunLog] = useState<string>("");

  const latest = data?.latest;
  const project = data?.project;

  const topScenario = useMemo(() => {
    if (!data?.scenarios.length) {
      return undefined;
    }
    return [...data.scenarios].sort((a, b) => b.durationMs - a.durationMs)[0];
  }, [data?.scenarios]);

  async function handleRun() {
    try {
      setRunning(true);
      const result = await runBenchmark(strict);
      setRunLog(result.stdout || result.stderr || "Benchmark run finished.");
      await mutate();
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : String(runError);
      setRunLog(message);
    } finally {
      setRunning(false);
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
          <p className="text-xs text-slate-400">{runLog || "Run output will appear here."}</p>
        </Card>
      </section>

      {error ? (
        <Card className="mb-6 border-red-400/50">
          <p className="text-sm text-red-200">Failed to load dashboard: {error instanceof Error ? error.message : "Unknown error"}</p>
        </Card>
      ) : null}

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
    </main>
  );
}
