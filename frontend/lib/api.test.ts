import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchDashboard, runBenchmark } from "./api";

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
    const payload = { project: { name: "x402", tagline: "t", sponsors: [] }, latest: null, scenarios: [] };
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
    expect(options.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(options.body))).toEqual({ strict: true });
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
      json: async () => ({}),
    } as MockResponse);

    await expect(runBenchmark(false)).rejects.toThrow("Run request failed with status 500");
  });
});
