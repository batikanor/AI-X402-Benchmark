import { requireEnv, getEnv } from "../utils/env.js";

function networkClientFactory(sdk, network) {
  if (network === "mainnet") return sdk.Client.forMainnet();
  if (network === "previewnet") return sdk.Client.forPreviewnet();
  return sdk.Client.forTestnet();
}

export class HederaAdapter {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  async executePayment({ scenarioId, payment, runId }) {
    const mode = this.config.mode || getEnv("HEDERA_MODE", "relay");
    if (mode === "sdk") {
      return this.executeViaSdk({ scenarioId, payment, runId });
    }
    if (mode === "relay") {
      return this.executeViaRelay({ scenarioId, payment, runId });
    }
    throw new Error(`Unsupported Hedera mode: ${mode}`);
  }

  async executeViaRelay({ scenarioId, payment, runId }) {
    const relayUrl = this.config.relayUrl || getEnv("HEDERA_RELAY_URL");
    if (!relayUrl) {
      throw new Error("Hedera relay mode requires HEDERA_RELAY_URL or integrations.hedera.relayUrl");
    }

    const apiKey = this.config.relayApiKey || getEnv("HEDERA_RELAY_API_KEY", "");
    const resp = await fetch(relayUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({
        runId,
        scenarioId,
        payment,
        network: this.config.network || getEnv("HEDERA_NETWORK", "testnet")
      })
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Hedera relay request failed (${resp.status}): ${body}`);
    }

    const payload = await resp.json();
    if (!payload.txHash) {
      throw new Error("Hedera relay response missing txHash");
    }

    return {
      txHash: payload.txHash,
      transactionId: payload.transactionId || null,
      network: payload.network || this.config.network || "testnet",
      mode: "relay"
    };
  }

  async executeViaSdk({ payment }) {
    requireEnv(["HEDERA_OPERATOR_ID", "HEDERA_OPERATOR_KEY"]);

    let sdk;
    try {
      sdk = await import("@hashgraph/sdk");
    } catch {
      throw new Error("Hedera SDK mode requires package @hashgraph/sdk. Install it before running SDK mode.");
    }

    if (!payment.recipientAccountId) {
      throw new Error("payment.recipientAccountId is required for Hedera SDK mode");
    }

    const network = this.config.network || getEnv("HEDERA_NETWORK", "testnet");
    const operatorId = getEnv("HEDERA_OPERATOR_ID");
    const operatorKey = getEnv("HEDERA_OPERATOR_KEY");

    const client = networkClientFactory(sdk, network);
    client.setOperator(
      sdk.AccountId.fromString(operatorId),
      sdk.PrivateKey.fromString(operatorKey)
    );

    const hbarAmount = Number(payment.amountHbar || 1);

    const tx = await new sdk.TransferTransaction()
      .addHbarTransfer(operatorId, new sdk.Hbar(-hbarAmount))
      .addHbarTransfer(payment.recipientAccountId, new sdk.Hbar(hbarAmount))
      .execute(client);

    const receipt = await tx.getReceipt(client);

    return {
      txHash: tx.transactionId.toString(),
      transactionId: tx.transactionId.toString(),
      status: receipt.status?.toString?.() || "UNKNOWN",
      network,
      mode: "sdk"
    };
  }
}
