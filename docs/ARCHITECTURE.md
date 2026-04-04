# Architecture: x402Bench Agentic Payments Benchmark

## Goal

Benchmark reliability, latency, safety, and resilience of agentic pay-per-request flows where payment execution, orchestration, and policy approval are all first-class dimensions.

## Core Pipeline

1. **Policy Gate (Ledger layer)**
- Evaluate policy (`amount`, destination, sanctions list, threshold).
- Trigger approval flow if threshold exceeds policy.
- Block scenario when policy disallows execution.

2. **Orchestration (Chainlink CRE layer)**
- Run workflow simulation/deployment through:
  - `cli` mode (CRE CLI), or
  - `webhook` mode (custom CRE workflow endpoint).

3. **Settlement (Hedera layer)**
- Execute payment through:
  - `sdk` mode (`@hashgraph/sdk`) using operator credentials, or
  - `relay` mode (custody/relayer endpoint).

4. **Service Probe (x402 endpoint layer)**
- Verify downstream service invocation after payment/workflow path.
- Record service probe success/failure and timing.

## Scoring

- Reliability: ratio of successful scenarios.
- Latency: p95 total latency transformed into bounded score.
- Safety: policy blocks/failures penalize score.
- Resilience: retries and failure-rate penalties.

Overall score:
- `40% Reliability`
- `20% Latency`
- `25% Safety`
- `15% Resilience`

## Output Artifacts

- JSON report: machine-readable benchmark evidence.
- Markdown report: judge-facing summary and scorecard.

## Trust Boundary

- Ledger policy layer controls risk escalation.
- Chainlink layer controls orchestration evidence.
- Hedera layer controls settlement evidence.

