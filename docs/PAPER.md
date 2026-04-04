# x402Bench Readiness: A Sponsor-Aligned Benchmark for LLM-Governed Payment Workflows

## Abstract

`x402Bench Readiness` is a benchmark for evaluating whether language models can make correct payment-policy decisions and support reliable workflow execution in sponsor-relevant blockchain settings. The benchmark targets the ETHGlobal Cannes 2026 sponsor stack (Hedera, Chainlink, Ledger) and combines three stress surfaces in one run: policy reasoning quality, documentation-grounded correctness, and live execution signal. Unlike pure QA benchmarks, x402Bench includes `real` execution cases that only run after a policy gate pass and adversarial `decision_only` cases that probe safety boundaries such as sanctions, KYC staleness, prompt-injection signals, and threshold-edge behavior.

## 1. Problem statement

Many hackathon agent demos can complete one success path but provide weak evidence that policy and execution behavior are robust under realistic risk conditions. This creates a gap between demo quality and deployability.

x402Bench addresses that gap by requiring:
- structured, scoreable policy outputs
- source-grounded justification from official protocol documentation
- execution-gate checks before workflow runs
- scenario-level and sponsor-level score breakdowns

## 2. Benchmark goals

The benchmark is designed to answer:
1. Can the model make correct operational policy decisions for payments?
2. Can it select the right controls for each scenario?
3. Can it ground decisions in required official documentation sources?
4. When policy allows execution, do workflows complete reliably and with acceptable latency?
5. How does performance differ by sponsor track?

## 3. Suite design

Current suite (`v2.0`) includes 12 cases:
- 7 `real` cases, eligible for workflow execution when gate checks pass
- 5 `decision_only` cases, used to stress adversarial/compliance behavior

Case metadata includes:
- expected outputs (`decision`, `approvalRequired`, `priority`, `riskLevel`, required controls)
- required docs source IDs
- sponsor `challengeTargets`
- representativeness rationale text

Suite path:
- [`readiness_bench/suite.json`](../readiness_bench/suite.json)

## 4. Sponsor-track alignment

Alignment intent is explicit at case level and mapped to ETHGlobal challenge statements.

Coverage counts in this release:
- Hedera: 6/12 cases
- Chainlink: 10/12 cases
- Ledger: 11/12 cases

Reference challenge pages:
- [ETHGlobal Cannes 2026 prizes](https://ethglobal.com/events/cannes2026/prizes)
- [Hedera prizes](https://ethglobal.com/events/cannes2026/prizes/hedera)
- [Chainlink prizes](https://ethglobal.com/events/cannes2026/prizes/chainlink)
- [Ledger prizes](https://ethglobal.com/events/cannes2026/prizes/ledger)

## 5. Documentation-grounded evaluation

The benchmark evaluates grounding against official technical sources, not sponsor marketing pages.

Default source domains:
- `docs.hedera.com`
- `docs.chain.link`
- `developers.ledger.com`
- `eips.ethereum.org`

Manifest:
- [`readiness_bench/docs_sources/default_sources.json`](../readiness_bench/docs_sources/default_sources.json)

Docs pack builder:
- [`scripts/build_docs_pack.mjs`](../scripts/build_docs_pack.mjs)

## 6. Method and scoring

### 6.1 Case loop

For each `(model, case, repeat)`:
1. Build strict prompt with scenario context + retrieved doc excerpts.
2. Parse output as JSON schema.
3. Score decision correctness and controls quality.
4. Score docs-grounding metrics.
5. If execution gate passes, run real workflow via adapters.
6. Record full row artifact.

### 6.2 Key metrics

Case-level:
- `basePolicyAccuracyPct`
- `controlsF1Pct`
- `accuracyPct`
- `docsGrounded`
- `executionEligible`
- `totalLatencyMs`

Model-level:
- decision quality averages
- parse/full-match/docs-grounding rates
- execution eligibility rate
- executed workflow pass rate
- mean/p95 latency

### 6.3 Execution gate

Execution is allowed only when:
- case mode is `real`
- expected policy for case is `allow`
- output parse succeeds
- decision, approval, priority, risk all match
- controls F1 >= 60

### 6.4 Aggregate score weights

With docs enabled:
- base policy 21%
- controls F1 18%
- parse rate 10%
- strict full-match rate 10%
- executed workflow pass rate 11%
- docs grounding rate 12%
- required-source coverage 9%
- citation validity 5%
- latency score 4%

With docs disabled:
- base policy 28%
- controls F1 24%
- parse rate 14%
- strict full-match rate 14%
- executed workflow pass rate 15%
- latency score 5%

Implementation source:
- [`scripts/run_llm_readiness_benchmark.mjs`](../scripts/run_llm_readiness_benchmark.mjs)

## 7. Why this format

The benchmark format intentionally follows practical lessons from established benchmark/reporting ecosystems:
- explicit scenario definitions and run protocol
- structured artifact outputs for auditability
- clear metric denominators and reproducibility fields
- versioned documentation of methodology and limitations

Related references:
- [MLCommons Inference Submission Guide](https://docs.mlcommons.org/inference/submission/)
- [HELM (Holistic Evaluation of Language Models)](https://arxiv.org/abs/2211.09110)
- [Model Cards for Model Reporting](https://arxiv.org/abs/1810.03993)
- [Data Cards for dataset documentation](https://arxiv.org/abs/2204.01075)

## 8. Reproducibility protocol

Baseline protocol:
1. configure environment (`.env`)
2. build docs pack (`npm run docs:build`)
3. run benchmark with fixed suite/docs/models
4. archive JSON + Markdown artifacts
5. report runtime, suite version, docs pack version, and repeats

Recommended for stronger comparisons:
- use `runsPerScenario >= 2`
- keep docs pack fixed across model sweeps
- report execution denominators (`executed pass/total`) to avoid ambiguous percentages

## 9. Limitations

- Small execution denominator can inflate or collapse execution percentages.
- Real workflow results depend on integration configuration and testnet reliability.
- Prompting is constrained to strict JSON output (not an unconstrained tool-calling benchmark).
- Retrieval is excerpt-based and optimized for reproducible scoring, not open-domain recall.

## 10. Future work

Planned improvements:
- confidence intervals for low-denominator execution metrics
- versioned sponsor-track weighting profiles
- optional tool-calling mode for MCP/agent-framework evaluations
- broader docs-source selection policies and provenance attestations

## 11. Artifact index

- Main readme: [`README.md`](../README.md)
- Benchmark card: [`docs/BENCHMARK_CARD.md`](./BENCHMARK_CARD.md)
- Architecture: [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md)
- Operations: [`docs/OPERATIONS.md`](./OPERATIONS.md)
