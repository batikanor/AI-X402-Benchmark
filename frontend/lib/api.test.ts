import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchHealth,
  fetchDashboard,
  fetchLlmDashboard,
  fetchReadinessDashboard,
  runBenchmark,
  runLlmBenchmark,
  runReadinessBenchmark,
} from "./api";

type MockResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

describe("x402 frontend api", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("fetchDashboard requests dashboard endpoint", async () => {
    const payload = {
      project: { name: "x402", tagline: "t", sponsors: [] },
      benchmarkDefinition: {
        workflow: {
          name: "w",
          whatIsBenchmarked: "w",
          mocked: false,
          scenarioCount: 0,
          statusNote: "ok",
          integrationStatus: {
            isFullyConfigured: false,
            hedera: { mode: "relay", configured: false, reason: "x" },
            chainlink: { mode: "webhook", configured: false, reason: "x" },
            ledger: { mode: "external_approver", configured: false, reason: "x" },
            serviceProbe: { configured: false, reason: "x" },
          },
        },
        llm: { name: "llm", whatIsBenchmarked: "llm", mocked: false },
      },
      latest: null,
      scenarios: [],
    };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    } as MockResponse);

    const result = await fetchDashboard();

    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/dashboard$/);
    expect(options).toEqual({ cache: "no-store" });
  });

  it("fetchLlmDashboard requests llm dashboard endpoint", async () => {
    const payload = {
      track: { name: "llm", mocked: false, runtime: "local_ollama", suiteName: "s", suitePath: "p", tasks: [] },
      availableModels: ["gemma4:e4b"],
      recommendedModels: ["gemma4:e4b"],
      latest: null,
      models: [],
    };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    } as MockResponse);

    const result = await fetchLlmDashboard();

    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/llm\/dashboard$/);
    expect(options).toEqual({ cache: "no-store" });
  });

  it("fetchHealth requests health endpoint", async () => {
    const payload = {
      status: "ok",
      workflowRunInProgress: false,
      llmRunInProgress: false,
      readinessRunInProgress: false,
      workflowTimeoutSeconds: 600,
      llmTimeoutSeconds: 2400,
      readinessTimeoutSeconds: 3600,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    } as MockResponse);

    const result = await fetchHealth();

    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/health$/);
    expect(options).toEqual({ cache: "no-store" });
  });

  it("fetchReadinessDashboard requests readiness dashboard endpoint", async () => {
    const payload = {
      project: { name: "x402", tagline: "t", sponsors: [] },
      track: {
        name: "readiness",
        whatIsBenchmarked: "x",
        mocked: false,
        scenarioCount: 1,
        statusNote: "ok",
        integrationStatus: {
          isFullyConfigured: true,
          hedera: { mode: "sdk", configured: true, reason: "ready" },
          chainlink: { mode: "webhook", configured: true, reason: "ready" },
          ledger: { mode: "external_approver", configured: true, reason: "ready" },
          serviceProbe: { configured: true, reason: "ready" },
        },
      },
      availableModels: ["gemma4:e4b", "qwen3:4b-instruct"],
      recommendedModels: ["gemma4:e4b", "qwen3:4b-instruct"],
      latest: null,
      models: [],
      results: [],
      scenarios: [],
    };

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    } as MockResponse);

    const result = await fetchReadinessDashboard();

    expect(result).toEqual(
      expect.objectContaining({
        ...payload,
        dataSource: {
          mode: "live",
          backendBaseUrl: "http://127.0.0.1:8000",
        },
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/readiness\/dashboard$/);
    expect(options).toEqual(expect.objectContaining({ cache: "no-store" }));
    expect(options.signal).toBeDefined();
  });

  it("fetchReadinessDashboard falls back to local snapshot when live backend is unreachable", async () => {
    const fallbackPayload = {
      project: { name: "x402", tagline: "t", sponsors: ["Hedera", "Chainlink", "Ledger"] },
      track: {
        name: "readiness",
        whatIsBenchmarked: "x",
        mocked: false,
        suiteName: "suite",
        suiteVersion: "2.0",
        suitePath: "/tmp/suite.json",
        scenarioCount: 1,
        runtimeUsed: "ollama",
        supportedRuntimes: ["ollama", "openai_compat"],
        docs: {
          defaultPackAvailable: true,
          defaultPackPath: "/tmp/docs.json",
          enabled: true,
          name: "docs",
          version: "v1",
          sourceCount: 1,
          topK: 5,
          requireCitations: true,
        },
        statusNote: "fallback",
        integrationStatus: {
          isFullyConfigured: false,
          hedera: { mode: "sdk", configured: false, reason: "x" },
          chainlink: { mode: "webhook", configured: false, reason: "x" },
          ledger: { mode: "external_approver", configured: false, reason: "x" },
          serviceProbe: { configured: false, reason: "x" },
        },
      },
      availableModels: ["gemma4:e4b", "qwen3:4b-instruct"],
      recommendedModels: ["qwen3:4b-instruct", "gemma4:e4b"],
      latest: null,
      models: [],
      results: [],
      scenarios: [],
    };

    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => fallbackPayload,
      } as MockResponse);

    const result = await fetchReadinessDashboard();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0] as [string])[0]).toMatch(/\/api\/v1\/readiness\/dashboard$/);
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe("/readiness-dashboard-fallback.json");
    expect(result.dataSource?.mode).toBe("fallback");
    expect(result.dataSource?.message).toMatch(/Live backend unavailable/);
    expect(result.track.statusNote).toMatch(/Live backend unavailable/);
  });

  it("fetchReadinessDashboard throws a descriptive error when both live and fallback fail", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({}),
      } as MockResponse);

    await expect(fetchReadinessDashboard()).rejects.toThrow(
      /Readiness dashboard unavailable\. Live API .* failed .* fallback snapshot is missing\./,
    );
  });

  it("runBenchmark posts strict payload", async () => {
    const payload = { ok: true, returnCode: 0, stdout: "done", stderr: "" };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    } as MockResponse);

    const result = await runBenchmark(true);

    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/runs$/);
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual(
      expect.objectContaining({
        "Content-Type": "application/json",
      }),
    );
    expect((options.headers as Record<string, string>)["Idempotency-Key"]).toMatch(/^workflow-/);
    expect(JSON.parse(String(options.body))).toEqual({ strict: true });
  });

  it("runLlmBenchmark posts multi-model payload", async () => {
    const payload = { ok: true, returnCode: 0, stdout: "done", stderr: "" };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    } as MockResponse);

    const result = await runLlmBenchmark({
      models: ["gemma4:e4b", "qwen3:4b-instruct"],
      runsPerTask: 1,
      maxTokens: 512,
      temperature: 0.1,
    });

    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/llm\/runs$/);
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual(
      expect.objectContaining({
        "Content-Type": "application/json",
      }),
    );
    expect((options.headers as Record<string, string>)["Idempotency-Key"]).toMatch(/^llm-/);
    expect(JSON.parse(String(options.body))).toEqual({
      models: ["gemma4:e4b", "qwen3:4b-instruct"],
      runsPerTask: 1,
      maxTokens: 512,
      temperature: 0.1,
    });
  });

  it("runReadinessBenchmark posts integrated payload", async () => {
    const payload = { ok: true, returnCode: 0, stdout: "done", stderr: "" };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    } as MockResponse);

    const result = await runReadinessBenchmark({
      models: ["gemma4:e4b", "qwen3:4b-instruct"],
      runtime: "ollama",
      runsPerScenario: 1,
      maxTokens: 512,
      temperature: 0.1,
    });

    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/readiness\/runs$/);
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual(
      expect.objectContaining({
        "Content-Type": "application/json",
      }),
    );
    expect((options.headers as Record<string, string>)["Idempotency-Key"]).toMatch(/^readiness-/);
    expect(JSON.parse(String(options.body))).toEqual({
      models: ["gemma4:e4b", "qwen3:4b-instruct"],
      runtime: "ollama",
      runsPerScenario: 1,
      maxTokens: 512,
      temperature: 0.1,
    });
  });

  it("fetchDashboard throws on non-2xx", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as MockResponse);

    await expect(fetchDashboard()).rejects.toThrow("Dashboard request failed with status 503");
  });

  it("runBenchmark throws on non-2xx", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "",
      json: async () => ({}),
    } as MockResponse & { text: () => Promise<string> });

    await expect(runBenchmark(false)).rejects.toThrow("Run request failed with status 500");
  });

  it("runLlmBenchmark throws on non-2xx", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "bad input",
      json: async () => ({}),
    } as MockResponse & { text: () => Promise<string> });

    await expect(
      runLlmBenchmark({
        models: ["gemma4:e4b"],
        runsPerTask: 1,
        maxTokens: 512,
        temperature: 0.1,
      }),
    ).rejects.toThrow("LLM run request failed with status 422: bad input");
  });

  it("runReadinessBenchmark throws on non-2xx", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => "run already in progress",
      json: async () => ({}),
    } as MockResponse & { text: () => Promise<string> });

    await expect(
      runReadinessBenchmark({
        models: ["gemma4:e4b", "qwen3:4b-instruct"],
        runtime: "ollama",
        runsPerScenario: 1,
        maxTokens: 512,
        temperature: 0.1,
      }),
    ).rejects.toThrow("Readiness run request failed with status 409: run already in progress");
  });
});
