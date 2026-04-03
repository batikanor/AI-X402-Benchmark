import { spawn } from "node:child_process";
import { getEnv } from "../utils/env.js";

function runProcess(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Process timeout: ${command} ${args.join(" ")}`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => { out += chunk.toString(); });
    child.stderr.on("data", (chunk) => { err += chunk.toString(); });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Process failed with code ${code}: ${err.trim()}`));
        return;
      }
      resolve({ out, err });
    });
  });
}

export class ChainlinkCreAdapter {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  async runWorkflow({ scenarioId, runId, workflowInput }) {
    const mode = this.config.mode || getEnv("CHAINLINK_MODE", "webhook");
    if (mode === "cli") {
      return this.runViaCli({ scenarioId, runId, workflowInput });
    }
    if (mode === "webhook") {
      return this.runViaWebhook({ scenarioId, runId, workflowInput });
    }
    throw new Error(`Unsupported Chainlink mode: ${mode}`);
  }

  async runViaCli({ scenarioId, runId, workflowInput }) {
    const command = this.config.cliPath || getEnv("CHAINLINK_CLI_PATH", "cre");
    const args = this.config.cliArgs || [
      "workflow",
      "simulate",
      "--input",
      JSON.stringify({ runId, scenarioId, ...workflowInput })
    ];

    const started = Date.now();
    const { out } = await runProcess(command, args, this.config.timeoutMs || 30_000);
    const durationMs = Date.now() - started;

    return {
      workflowId: `${runId}-${scenarioId}`,
      status: "simulated",
      mode: "cli",
      durationMs,
      output: out.trim()
    };
  }

  async runViaWebhook({ scenarioId, runId, workflowInput }) {
    const webhookUrl = this.config.webhookUrl || getEnv("CHAINLINK_WEBHOOK_URL");
    if (!webhookUrl) {
      throw new Error("Chainlink webhook mode requires CHAINLINK_WEBHOOK_URL or integrations.chainlink.webhookUrl");
    }

    const token = this.config.webhookToken || getEnv("CHAINLINK_WEBHOOK_TOKEN", "");

    const started = Date.now();
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        runId,
        scenarioId,
        workflowInput
      })
    });
    const durationMs = Date.now() - started;

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Chainlink webhook failed (${resp.status}): ${body}`);
    }

    const payload = await resp.json();

    return {
      workflowId: payload.workflowId || `${runId}-${scenarioId}`,
      status: payload.status || "completed",
      mode: "webhook",
      durationMs,
      output: payload
    };
  }
}
