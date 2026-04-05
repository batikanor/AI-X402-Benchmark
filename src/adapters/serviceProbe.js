import { getEnv } from "../utils/env.js";

export class ServiceProbe {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  async probe({ runId, scenarioId, txHash, workflowId }) {
    const url = this.config.url || getEnv("SERVICE_PROBE_URL", "");
    if (!url) {
      return {
        status: "skipped",
        code: null,
        details: "No service probe URL configured",
        endpoint: null
      };
    }

    const token = this.config.token || getEnv("SERVICE_PROBE_TOKEN", "");

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        runId,
        scenarioId,
        txHash,
        workflowId
      })
    });

    const bodyText = await resp.text();

    return {
      status: resp.ok ? "ok" : "failed",
      code: resp.status,
      details: bodyText,
      endpoint: url
    };
  }
}
