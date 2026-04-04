import { getEnv } from "../utils/env.js";

export class LedgerPolicyAdapter {
  constructor(config, globalPolicy, logger) {
    this.config = config;
    this.globalPolicy = globalPolicy;
    this.logger = logger;
  }

  evaluatePolicy({ amountUsd, destinationCountry }) {
    const blockedCountries = new Set(
      (this.globalPolicy.blockedCountries || [])
        .map((item) => String(item || "").trim().toUpperCase())
        .filter(Boolean)
    );
    const highValueThresholdUsd = Number(this.globalPolicy.highValueThresholdUsd || 0);
    const normalizedCountry = String(destinationCountry || "").trim().toUpperCase();

    if (normalizedCountry && blockedCountries.has(normalizedCountry)) {
      return {
        allowed: false,
        approvalRequired: false,
        reason: `Destination country ${normalizedCountry} is blocked by policy`
      };
    }

    if (amountUsd >= highValueThresholdUsd) {
      return {
        allowed: true,
        approvalRequired: true,
        reason: `Amount ${amountUsd} exceeds threshold ${highValueThresholdUsd}`
      };
    }

    return {
      allowed: true,
      approvalRequired: false,
      reason: "Within policy"
    };
  }

  async requestApproval({ scenarioId, runId, amountUsd }) {
    const mode = this.config.mode || getEnv("LEDGER_MODE", "external_approver");

    if (mode === "external_approver") {
      return this.requestExternalApproval({ scenarioId, runId, amountUsd });
    }
    if (mode === "ledger_hw") {
      return this.requestLedgerHardwareApproval({ scenarioId, runId, amountUsd });
    }

    throw new Error(`Unsupported Ledger mode: ${mode}`);
  }

  async requestExternalApproval({ scenarioId, runId, amountUsd }) {
    const approverUrl = this.config.approverUrl || getEnv("LEDGER_APPROVER_URL");
    if (!approverUrl) {
      throw new Error("external_approver mode requires LEDGER_APPROVER_URL or integrations.ledger.approverUrl");
    }

    const token = this.config.approverToken || getEnv("LEDGER_APPROVER_TOKEN", "");

    const resp = await fetch(approverUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        runId,
        scenarioId,
        amountUsd,
        challenge: `x402bench:${runId}:${scenarioId}:${amountUsd}`
      })
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`External approver failed (${resp.status}): ${body}`);
    }

    const payload = await resp.json();
    return {
      approved: Boolean(payload.approved),
      approverRef: payload.approverRef || payload.approvalId || null,
      details: payload
    };
  }

  async requestLedgerHardwareApproval({ scenarioId, runId, amountUsd }) {
    let Eth;
    let TransportNodeHid;

    try {
      ({ default: Eth } = await import("@ledgerhq/hw-app-eth"));
      ({ default: TransportNodeHid } = await import("@ledgerhq/hw-transport-node-hid"));
    } catch {
      throw new Error("ledger_hw mode requires @ledgerhq/hw-app-eth and @ledgerhq/hw-transport-node-hid packages");
    }

    const transport = await TransportNodeHid.create();
    try {
      const app = new Eth(transport);
      const path = this.config.derivationPath || "44'/60'/0'/0/0";
      const address = await app.getAddress(path);
      const challenge = Buffer.from(`x402bench:${runId}:${scenarioId}:${amountUsd}`).toString("hex");
      const signature = await app.signPersonalMessage(path, challenge);

      return {
        approved: true,
        approverRef: address.address,
        details: {
          signature
        }
      };
    } finally {
      await transport.close();
    }
  }
}
