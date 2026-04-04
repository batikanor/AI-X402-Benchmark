import test from "node:test";
import assert from "node:assert/strict";
import { validateConfig } from "../src/core/validateConfig.js";

test("validateConfig returns errors for malformed input", () => {
  const result = validateConfig({ suite: {}, scenarios: [] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test("validateConfig passes for minimal valid config", () => {
  const result = validateConfig({
    suite: { id: "abc" },
    scenarios: [
      {
        id: "s1",
        name: "S1",
        payment: { amountUsd: 1 }
      }
    ],
    policy: {
      highValueThresholdUsd: 10,
      blockedCountries: []
    },
    integrations: {
      hedera: {},
      chainlink: {},
      ledger: {}
    }
  });

  assert.equal(result.ok, true);
});
