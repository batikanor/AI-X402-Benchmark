# 4-Minute Pitch Plans: x402Bench Agentic Payments Benchmark

## Pitch Option 1: Infra-Judge Technical Narrative

### 0:00-0:35 Problem
- Teams show one payment happy path but cannot prove release readiness.
- Missing benchmark gates for reliability, policy safety, and settlement correctness.

### 0:35-1:55 Demo Core
1. Trigger a benchmark run from dashboard.
2. Show the scenario timeline: Ledger policy -> Chainlink orchestration -> Hedera settlement -> x402 service probe.
3. Open the generated JSON and Markdown artifact.

### 1:55-2:45 Scoring and Why It Matters
- Explain weighted score dimensions and strict threshold gate.
- Highlight one failure scenario and one recovery scenario.

### 2:45-3:35 Sponsor Fit
- Hedera: settlement evidence and tx-level outcomes.
- Chainlink: orchestration reliability under retries.
- Ledger: explicit policy gate and approval flows.

### 3:35-4:00 Close
- "This is not a demo dapp, this is release infrastructure for agentic payments."

## Pitch Option 2: Product + GTM Narrative

### 0:00-0:40 Wedge
- Every agentic commerce stack needs confidence telemetry before production.
- x402Bench is the benchmark SKU teams run before shipping.

### 0:40-1:45 Demo
- Run baseline and strict mode back-to-back.
- Show pass/fail behavior and publishable report.

### 1:45-2:35 Traction Story
- Local LLM benchmark artifact already generated.
- Open-source report corpus + leaderboard path for public credibility.

### 2:35-3:30 Business Story
- Initial buyer: wallets and agent platform teams.
- Expansion: CI benchmark gates as paid SaaS control plane.

### 3:30-4:00 Sponsor Fit + Ask
- Infra-grade benchmark with immediate sponsor utility.
- Ask judges to evaluate as deployable observability product.

## Pitch Option 3: Security and Trust Narrative

### 0:00-0:45 Trust Gap
- Users and operators cannot inspect if agentic payments were policy-safe.
- Security incidents often start with weak approval and opaque execution paths.

### 0:45-1:50 Demo
- Run high-value scenario that triggers approval requirements.
- Show block/allow behavior and post-run evidence trail.

### 1:50-2:50 Security Controls
- Idempotent benchmark trigger endpoint.
- Serialized run locking.
- Timeout-bounded subprocess execution.
- Signed/typed transaction transparency mapping (EIP-712/EIP-7730 references).

### 2:50-3:35 Deployment Realism
- Works in local replay, live testnet, or hybrid mode.
- Immediate CI gate candidate with strict threshold.

### 3:35-4:00 Close
- "We benchmark trust posture, not just latency."

## Demo Fallback Plan (if live infra fails)

1. Use latest real artifact from prior run.
2. Re-run a local replay scenario live for deterministic output.
3. Show `/api/v1/alignment` and strict gate semantics to preserve technical credibility.
