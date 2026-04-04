# Architecture: x402Bench Agentic Payments Benchmark

## Outcome

x402Bench is a benchmark control plane for agentic payments. It scores whether a payment workflow is reliable, low-latency, policy-safe, and resilient under retries.

## System Pipeline

1. Policy gate (Ledger track)
- Evaluates amount, destination, sanctions flags, and approval thresholds.
- Produces an explicit pass/block/approval-required outcome.

2. Orchestration (Chainlink track)
- Executes workflow simulation or trigger path via `cli` or `webhook` mode.
- Emits orchestration latency and failure telemetry.

3. Settlement (Hedera track)
- Executes transfer through `sdk` (live) or `relay` (managed) mode.
- Persists settlement timing and outcome.

4. Service probe (x402 track)
- Confirms downstream paid endpoint access and response correctness.

## Scoring Contract

- Reliability: successful scenarios / total scenarios.
- Latency: p95 end-to-end latency transformed to bounded score.
- Safety: policy and approval correctness penalties.
- Resilience: retry and failure-rate penalty curve.

Overall score weights:
- Reliability: 40%
- Latency: 20%
- Safety: 25%
- Resilience: 15%

## Backend Reliability Controls

- Serialized run execution with global run mutex.
- `Idempotency-Key` support for duplicate-safe POST retries.
- Bounded subprocess timeout (`BENCH_RUN_TIMEOUT_SECONDS`, clamped 30-1800s).
- Structured JSON/Markdown artifacts for auditable judging evidence.

## Protocol and Standards Alignment

- Hedera transaction and settlement semantics:
  - https://docs.hedera.com/hedera/sdks-and-apis/hedera-api/basic-types/transactionid
  - https://docs.hedera.com/hedera/core-concepts/mirror-nodes
- Chainlink operational guidance:
  - https://docs.chain.link/data-feeds/developer-responsibilities
  - https://docs.chain.link/chainlink-automation/concepts/best-practice
- Ledger clear-signing guidance:
  - https://developers.ledger.com/docs/clear-signing/for-dapps/get-started
  - https://developers.ledger.com/docs/clear-signing/for-wallets
- Typed signing standards for transparent intent:
  - https://eips.ethereum.org/EIPS/eip-712
  - https://eips.ethereum.org/EIPS/eip-7730

## Artifact Model

Per run:
- `reports/<runId>.json`: full machine evidence.
- `reports/<runId>.md`: human-readable scorecard.

This allows direct use in judging, CI gates, and post-event public benchmark publication.
