# x402Bench Benchmark Card

## 1) Identity

- Benchmark name: `x402Bench LLM Readiness`
- Suite name: `x402Bench Readiness Suite v2`
- Suite version: `2.0`
- Release: `2026.1`
- Maintainers: hackathon project team
- Primary domain: policy-aware payment workflow readiness

## 2) Intended use

Use this benchmark to compare LLMs on:
- payment policy decision correctness
- required control selection quality
- ability to ground decisions in official protocol docs
- eligibility for real workflow execution
- live workflow pass rate and latency for executable cases

Not intended use:
- absolute safety certification
- legal/compliance guarantees
- production readiness without additional domain controls

## 3) Scope and scenario design

Current suite has 12 cases:
- 7 `real` cases: can execute workflow when gate passes
- 5 `decision_only` cases: adversarial/compliance checks where execution is intentionally not attempted

Per-case metadata includes:
- expected decision fields
- required documentation sources
- explicit sponsor challenge targets
- rationale for representativeness

Source file:
- [`readiness_bench/suite.json`](../readiness_bench/suite.json)

## 4) Data and documentation provenance

The docs-grounding pack is built from official sources only:
- Hedera docs
- Chainlink docs
- Ledger developer docs
- Ethereum EIPs

Manifest:
- [`readiness_bench/docs_sources/default_sources.json`](../readiness_bench/docs_sources/default_sources.json)

Builder:
- [`scripts/build_docs_pack.mjs`](../scripts/build_docs_pack.mjs)

Important distinction:
- ETHGlobal pages are used for challenge mapping.
- Docs-grounding is evaluated against official protocol docs, not ETHGlobal pages.

## 5) Execution model

For each model and case:
1. Construct strict structured prompt with scenario + selected doc excerpts.
2. Parse JSON response.
3. Score decision and docs-grounding quality.
4. If case is `real` and execution gate passes, run live workflow adapters.
5. Record final row with policy metrics, gate status, workflow status, and latency.

Runner:
- [`scripts/run_llm_readiness_benchmark.mjs`](../scripts/run_llm_readiness_benchmark.mjs)

## 6) Metric definitions

Case-level:
- `basePolicyAccuracyPct`: avg of decision/approval/priority/risk matches
- `controlsF1Pct`: set overlap quality for required controls
- `accuracyPct`: weighted case score (55% base policy, 35% controls F1, 10% parse)
- `docsGrounded`: pass/fail according to citation requirements and required-source coverage
- `executionEligible`: whether case can proceed to execution

Model-level aggregates:
- decision quality averages
- parse/full-match/docs-grounding rates
- execution eligibility rate
- executed workflow pass rate
- mean and p95 end-to-end latency

## 7) Score weighting

With docs enabled:
- 21% base policy accuracy
- 18% controls F1
- 10% parse rate
- 10% strict full-match rate
- 11% executed workflow pass rate
- 12% docs grounding rate
- 9% required-source coverage
- 5% citation validity
- 4% latency score

With docs disabled:
- 28% base policy accuracy
- 24% controls F1
- 14% parse rate
- 14% strict full-match rate
- 15% executed workflow pass rate
- 5% latency score

## 8) Execution gate policy

`executionEligible = true` only if all are true:
- `executionMode == real`
- expected decision is `allow`
- parse success
- decision match
- approval match
- priority match
- risk match
- controls F1 >= 60

Note:
- docs grounding affects quality score and strict-match criteria.
- docs grounding does not directly block execution gate.

## 9) Sponsor-track representativeness

Case mapping coverage in this release:
- Hedera: 6/12 cases
- Chainlink: 10/12 cases
- Ledger: 11/12 cases

Challenge references (ETHGlobal Cannes 2026):
- [ETHGlobal prizes page](https://ethglobal.com/events/cannes2026/prizes)
- [Hedera challenge page](https://ethglobal.com/events/cannes2026/prizes/hedera)
- [Chainlink challenge page](https://ethglobal.com/events/cannes2026/prizes/chainlink)
- [Ledger challenge page](https://ethglobal.com/events/cannes2026/prizes/ledger)

## 10) Reproducibility protocol

Minimum reproducibility steps:
1. `cp .env.example .env`
2. `npm run docs:build`
3. `npm run readiness:bench` (or explicit CLI args)
4. Archive both JSON and Markdown artifacts
5. Record model list, runtime, suite version, docs pack version, and runs-per-scenario

Recommended:
- run with 2-3 repeats per case for lower variance
- keep same docs pack across model comparisons
- compare models on identical case set and runtime settings

## 11) Known limitations

- Small execution denominator can yield volatile `Executed pass %`.
- Live workflow behavior depends on configured integration endpoints and testnet conditions.
- Prompt format is fixed to structured JSON output; this does not evaluate unconstrained tool-calling agents.
- Docs retrieval is lexical and excerpt-based, not a full retrieval benchmark.

## 12) Change log

- `2026.1`
  - Added explicit per-case sponsor challenge mapping metadata.
  - Added representativeness rationale per case.
  - Clarified execution-gate semantics and docs-grounding role.
  - Updated docs for benchmark reporting and reproducibility.
