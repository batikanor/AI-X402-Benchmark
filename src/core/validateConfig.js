const REQUIRED_TOP_LEVEL = ["suite", "scenarios", "policy", "integrations"];

export function validateConfig(config) {
  const errors = [];

  for (const key of REQUIRED_TOP_LEVEL) {
    if (config[key] === undefined) {
      errors.push(`Missing top-level key: ${key}`);
    }
  }

  if (!Array.isArray(config.scenarios) || config.scenarios.length === 0) {
    errors.push("scenarios must be a non-empty array");
  }

  if (config.policy) {
    if (typeof config.policy.highValueThresholdUsd !== "number") {
      errors.push("policy.highValueThresholdUsd must be a number");
    }
    if (!Array.isArray(config.policy.blockedCountries)) {
      errors.push("policy.blockedCountries must be an array");
    }
  }

  if (config.integrations) {
    if (!config.integrations.hedera || !config.integrations.chainlink || !config.integrations.ledger) {
      errors.push("integrations must include hedera, chainlink, and ledger sections");
    }
  }

  for (const [index, scenario] of (config.scenarios || []).entries()) {
    if (!scenario.id) errors.push(`scenario[${index}] missing id`);
    if (!scenario.name) errors.push(`scenario[${index}] missing name`);
    if (!scenario.payment) errors.push(`scenario[${index}] missing payment`);
    if (scenario.payment && typeof scenario.payment.amountUsd !== "number") {
      errors.push(`scenario[${index}].payment.amountUsd must be a number`);
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}
