import { spawn } from "node:child_process";
import { getEnv } from "../utils/env.js";

const SUPPORTED_CLI_ACTIONS = new Set(["simulate", "deploy"]);

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
      resolve({ out, err, code });
    });
  });
}

function safeParseJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function replaceArgTemplate(value, variables) {
  const source = String(value || "");
  return source.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (_, token) => {
    if (!Object.prototype.hasOwnProperty.call(variables, token)) return "";
    return String(variables[token] ?? "");
  });
}

function cliArgsFromEnv() {
  const raw = String(getEnv("CHAINLINK_CLI_ARGS", "") || "").trim();
  if (!raw) return [];
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
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
    const actionRaw = String(this.config.cliAction || getEnv("CHAINLINK_CRE_ACTION", "simulate")).toLowerCase();
    if (!SUPPORTED_CLI_ACTIONS.has(actionRaw)) {
      throw new Error(`Unsupported CHAINLINK_CRE_ACTION: ${actionRaw}. Use simulate or deploy.`);
    }
    const payload = {
      runId,
      scenarioId,
      ...workflowInput,
      source: "x402bench",
    };

    const envCliArgs = cliArgsFromEnv();
    const argsTemplate = Array.isArray(this.config.cliArgs) && this.config.cliArgs.length
      ? this.config.cliArgs
      : envCliArgs.length
        ? envCliArgs
      : [
          "workflow",
          actionRaw,
          "--input",
          "${jsonPayload}",
        ];
    const args = argsTemplate.map((item) => replaceArgTemplate(item, {
      runId,
      scenarioId,
      jsonPayload: JSON.stringify(payload),
    }));

    const started = Date.now();
    const { out } = await runProcess(command, args, this.config.timeoutMs || 30_000);
    const durationMs = Date.now() - started;
    const outputText = String(out || "").trim();
    const parsed = safeParseJson(outputText);
    const workflowId = String(
      parsed?.workflowId
      || parsed?.id
      || parsed?.deploymentId
      || `${runId}-${scenarioId}`,
    );
    const status = String(parsed?.status || (actionRaw === "deploy" ? "deployed" : "simulated"));

    return {
      workflowId,
      status,
      mode: "cli",
      endpoint: `${command} ${args.join(" ")}`.trim(),
      durationMs,
      output: parsed || outputText,
      provider: "chainlink-cre-cli",
      action: actionRaw,
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
      endpoint: webhookUrl,
      durationMs,
      output: payload
    };
  }
}
