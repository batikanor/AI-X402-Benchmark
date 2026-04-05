# x402Bench LLM Readiness

`x402Bench` is a reproducible benchmark for **LLM readiness in payment workflows** across Hedera, Chainlink, and Ledger.

It evaluates one model run as a full pipeline:
1. policy decision quality (`allow/block`, approval requirement, priority, risk, controls)
2. docs-grounded correctness against official protocol docs
3. execution eligibility gate
4. live workflow execution signal (for real cases only)
5. end-to-end latency

Current benchmark suite:
- Suite: `x402Bench Readiness Suite v2`
- Suite version: `2.0`
- Release tag: `2026.1`
- Cases: `12` total (`7` real execution + `5` decision-only)

## Latest benchmark output (pinned)

This section is a direct copy of the newest benchmark artifact in [`readiness_bench/results/`](./readiness_bench/results/).

Run metadata:
- Run ID: `x402-readiness-20260405073522-f96cdccb`
- Source file: `readiness_bench/results/x402-readiness-20260405073522-f96cdccb.json`
- Started: `2026-04-05T07:35:22.638Z`
- Finished: `2026-04-05T07:43:45.591Z`
- Runtime: `openai_compat` (OpenRouter/OpenAI-compatible)
- Models: `6`
- Total evaluations: `144` (`12 cases × 2 doc modes × 6 models`)

### Model scores (with docs context)

| Rank | Model | Overall | Policy Quality % | Strict Match % | Required Docs Coverage % | Gate Eligible % | Executed Pass % | Mean E2E Latency (ms) |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | `openai/gpt-5.4-mini` | 69.35 | 74.39 | 8.33 | 13.89 | 8.33 | 100.00 | 1465.94 |
| 2 | `google/gemma-2-9b-it` | 65.58 | 64.99 | 16.67 | 0.00 | 16.67 | 100.00 | 1189.76 |
| 3 | `meta-llama/llama-3.1-8b-instruct` | 64.54 | 66.96 | 16.67 | 0.00 | 16.67 | 100.00 | 3268.00 |
| 4 | `qwen/qwen3-8b` | 47.41 | 45.10 | 8.33 | 0.00 | 8.33 | 100.00 | 10550.23 |
| 5 | `openai/gpt-5.4-nano` | 47.37 | 64.60 | 0.00 | 6.94 | 0.00 | 0.00 | 1519.17 |
| 6 | `qwen/qwen2.5-coder-7b-instruct` | 2.88 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 1435.84 |

### Model scores (without docs context)

| Rank | Model | Overall | Policy Quality % | Strict Match % | Required Docs Coverage % | Gate Eligible % | Executed Pass % | Mean E2E Latency (ms) |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | `qwen/qwen3-8b` | 78.85 | 86.81 | 33.33 | 0.00 | 33.33 | 100.00 | 11171.13 |
| 2 | `openai/gpt-5.4-mini` | 74.70 | 81.07 | 25.00 | 0.00 | 16.67 | 100.00 | 1342.61 |
| 3 | `meta-llama/llama-3.1-8b-instruct` | 73.02 | 78.24 | 25.00 | 0.00 | 33.33 | 100.00 | 2523.22 |
| 4 | `google/gemma-2-9b-it` | 72.77 | 78.92 | 16.67 | 0.00 | 25.00 | 100.00 | 1261.70 |
| 5 | `openai/gpt-5.4-nano` | 67.40 | 74.40 | 8.33 | 0.00 | 16.67 | 100.00 | 1686.02 |
| 6 | `qwen/qwen2.5-coder-7b-instruct` | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 1992.00 |

## Why this exists

Hackathon demos often show a single happy-path payment.
This benchmark is built to answer a harder question:

> Is a model actually ready to run policy-sensitive payment flows with traceable, docs-grounded reasoning?

## Sponsor-track representativeness (ETHGlobal Cannes 2026)

The suite includes explicit per-case `challengeTargets` mapped to ETHGlobal sponsor challenge text.

Coverage in current suite:

| Sponsor | Cases mapped | ETHGlobal challenge alignment |
| --- | ---: | --- |
| Hedera | 8/12 | AI & Agentic Payments on Hedera |
| Chainlink | 10/12 | Best workflow with Chainlink CRE, Connect the World, Privacy Standard |
| Ledger | 11/12 | AI Agents x Ledger, Clear Signing/Integrations/Apps |

Challenge definitions are displayed in the UI and sourced from:
- [ETHGlobal Cannes 2026 prizes](https://ethglobal.com/events/cannes2026/prizes)
- [Hedera prize page](https://ethglobal.com/events/cannes2026/prizes/hedera)
- [Chainlink prize page](https://ethglobal.com/events/cannes2026/prizes/chainlink)
- [Ledger prize page](https://ethglobal.com/events/cannes2026/prizes/ledger)

Important: ETHGlobal pages are used for challenge mapping only. The benchmark docs-grounding pack uses official protocol docs, not ETHGlobal content.

## Chainlink CRE-aligned execution profile

This branch adds a Chainlink-first profile that runs orchestration through CRE tooling instead of local-only webhook simulation.

Official references used for alignment:
- [ETHGlobal Chainlink sponsor page (Cannes 2026)](https://ethglobal.com/events/cannes2026/prizes/chainlink)
- [Chainlink CRE docs](https://docs.chain.link/cre)
- [Chainlink Automation best practices](https://docs.chain.link/chainlink-automation/concepts/best-practice)

Implementation details:
- CRE adapter supports `simulate` and `deploy` actions in CLI mode.
- CLI command path and action are explicit via env/config (`CHAINLINK_CLI_PATH`, `CHAINLINK_CRE_ACTION`).
- Benchmark trace now records the effective CLI command in `workflow.trace[].endpoint` for evidence.
- Dedicated benchmark config for this mode: [`config/benchmark.chainlink-cre.config.json`](./config/benchmark.chainlink-cre.config.json)

## Documentation-grounding sources (official)

Default docs pack is built from:
- Hedera docs (`docs.hedera.com`)
- Chainlink docs (`docs.chain.link`)
- Ledger developer docs (`developers.ledger.com`)
- EIPs (`eips.ethereum.org`)

Source manifest:
- [`readiness_bench/docs_sources/default_sources.json`](./readiness_bench/docs_sources/default_sources.json)

Dual-mode evaluation (default):
- `with_docs`: model receives retrieved official-doc excerpts in prompt context
- `without_docs`: model receives zero docs excerpts (tests retained sponsor knowledge)

Docs context policy:
- `docsTopK=0` means full docs context for each case (all chunks from selected docs pack sources).
- UI run panel now uses this full-context mode by default.

Each readiness run now executes both modes for every selected model and case, then reports:
- per-mode leaderboards
- per-model deltas (`with_docs - without_docs`)

## Scoring model

Per-case scoring combines:
- base policy accuracy
- controls F1
- parse success
- workflow execution success (for executable `real` cases)

Fair comparison rule (`with_docs` vs `without_docs`):
- prompt/scoring/gating are identical across modes
- only one thing changes: `with_docs` appends official docs excerpts to the prompt
- citation/doc-grounding fields are logged as diagnostics only; they are not pass/fail gates

Execution eligibility gate for `real` cases requires:
- expected policy for case is `allow`
- parseable JSON output
- decision, approval, priority, risk all match
- controls F1 >= 60

Suite-level model score is weighted identically for both modes in `modelSummaryRows()`:
- base policy 28%
- controls F1 24%
- parse rate 14%
- strict full match 14%
- executed workflow success 15%
- latency score 5%

Metric caveat:
- `Executed pass %` is computed only over executed workflows.
- Small denominators can appear as `0%` or `100%` (for example `1/1`).
- The UI always shows explicit `pass/total` counts.

## Benchmark format and reporting standard

x402Bench follows practices inspired by benchmark reporting literature:
- scenario definitions and required conditions are explicit and versioned
- run outputs are machine-readable (`.json`) and human-readable (`.md`)
- benchmark methodology, limitations, and provenance are documented

Reference influences:
- [MLCommons Inference submission process](https://docs.mlcommons.org/inference/submission/)
- [HELM: Holistic Evaluation of Language Models](https://arxiv.org/abs/2211.09110)
- [Model Cards for Model Reporting](https://arxiv.org/abs/1810.03993)
- [Data Cards for dataset documentation](https://arxiv.org/abs/2204.01075)

See:
- [`docs/BENCHMARK_CARD.md`](./docs/BENCHMARK_CARD.md)
- [`docs/PAPER.md`](./docs/PAPER.md)

## Quickstart

### 1) Prerequisites

- Node.js 20+
- Python 3.10+

### 2) Install and configure

```bash
npm install
cp .env.example .env
```

Set required values in `.env`.
At minimum for local/dev operation:
- Hedera operator credentials (SDK mode) or relay URL
- Chainlink CRE CLI (`CHAINLINK_MODE=cli`, `CHAINLINK_CLI_PATH`, `CHAINLINK_CRE_ACTION`) or webhook URL
- Ledger approver URL (or use API fallback wiring)

For hosted readiness runs (recommended):
- `OPENROUTER_API_KEY` (required)
- `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`
- `OPENROUTER_REFERER` and `OPENROUTER_TITLE` (optional but recommended)
- `X402BENCH_MODEL_TIMEOUT_MS=90000` (recommended to avoid stalled provider calls hanging a run)
- `X402BENCH_SETTLEMENT_HBAR_OVERRIDE=0.01` (recommended for hackathon testing to reduce Hedera testnet token burn)

Hedera settlement throttling (optional):
- `X402BENCH_SETTLEMENT_HBAR_OVERRIDE`: if set, every real settlement uses this exact HBAR amount.
- `X402BENCH_SETTLEMENT_HBAR_MULTIPLIER`: scales per-case `amountHbar` when override is empty.
- `X402BENCH_SETTLEMENT_HBAR_MIN` / `X402BENCH_SETTLEMENT_HBAR_MAX`: clamps final transfer amount.

For direct OpenAI runs:
- `OPENAI_API_KEY` (required)
- `OPENAI_BASE_URL=https://api.openai.com/v1`

Run env diagnostics:

```bash
npm run env:diagnose
```

The script validates required keys for active modes, pings integration endpoints, and appends any human-required follow-ups to workspace queue:
- `../../runtime/manual_input_requests.md`

### 3) Build official docs pack

```bash
npm run docs:build
```

### 4) Run readiness benchmark

```bash
npm run readiness:bench
```

Chainlink CRE profile (simulate):

```bash
npm run readiness:bench:chainlink-cre
```

Chainlink CRE profile (deploy):

```bash
npm run readiness:bench:chainlink-cre:deploy
```

Optional explicit mode override:

```bash
node scripts/run_llm_readiness_benchmark.mjs \
  --config config/benchmark.config.json \
  --suite readiness_bench/suite.json \
  --runtime openai_compat \
  --api-base-url https://openrouter.ai/api/v1 \
  --api-key-env OPENROUTER_API_KEY \
  --models openai/gpt-5.4-mini,openai/gpt-5.4-nano,qwen/qwen3-8b,qwen/qwen2.5-coder-7b-instruct,meta-llama/llama-3.1-8b-instruct,google/gemma-2-9b-it \
  --doc-modes with_docs,without_docs
```

Wider model set:

```bash
npm run readiness:bench:wide
```

Hosted OpenAI-compatible endpoint (OpenRouter example):

```bash
node scripts/run_llm_readiness_benchmark.mjs \
  --config config/benchmark.config.json \
  --suite readiness_bench/suite.json \
  --runtime openai_compat \
  --api-base-url https://openrouter.ai/api/v1 \
  --api-key-env OPENROUTER_API_KEY \
  --models openai/gpt-5.4-mini,openai/gpt-5.4-nano,qwen/qwen3-8b,qwen/qwen2.5-coder-7b-instruct,meta-llama/llama-3.1-8b-instruct,google/gemma-2-9b-it \
  --doc-modes with_docs,without_docs
```

Official OpenAI cheap mini/nano run:

```bash
# requires OPENAI_API_KEY in .env
npm run readiness:bench:openai-cheap
```

Prompt override (same prompt in both docs modes):

```bash
node scripts/run_llm_readiness_benchmark.mjs \
  --config config/benchmark.config.json \
  --suite readiness_bench/suite.json \
  --runtime openai_compat \
  --api-base-url https://openrouter.ai/api/v1 \
  --api-key-env OPENROUTER_API_KEY \
  --models openai/gpt-5.4-mini,openai/gpt-5.4-nano,qwen/qwen3-8b,qwen/qwen2.5-coder-7b-instruct,meta-llama/llama-3.1-8b-instruct,google/gemma-2-9b-it \
  --prompt-override "Return strict JSON only using the benchmark schema and prioritize policy-safe decisions."
```

Routing rules:
- All readiness models run through OpenAI-compatible hosted endpoints (OpenRouter/OpenAI).
- IDs with provider/model slash (for example `qwen/qwen3-8b`) are recommended for OpenRouter consistency.
- Optional explicit `openai:<model>` prefix is supported.
- `ollama:` model tags are rejected by the readiness runner.

Latest mini/nano model IDs are discovered from your account via `/v1/models`.
As of April 5, 2026 in this workspace account they are:
- `gpt-5.4-mini`
- `gpt-5.4-nano`

### 5) Start backend + frontend (stable demo mode)

```bash
# terminal A
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
npm run api:start

# terminal B
npm --prefix frontend install
npm run ui:prod

# terminal C (after terminal B prints "Ready")
npm run ui:health
```

Open:
- [http://127.0.0.1:46211](http://127.0.0.1:46211)

UI behavior:
- Model input is manual CSV only.
- On page load, manual model list auto-seeds from the latest benchmark run models shown in the dashboard.
- Sponsor challenge map includes a `Case Flow Visualizer`: click representative sponsor/case-type rows to inspect case inputs, scoring formulas, gate status, and per-stage attempted/skipped call traces.

`ui:health` validates that the HTML and linked CSS both return `200` so you do not get an unstyled page.

Optional (local UI iteration only):

```bash
npm run ui:dev
```

## Artifacts

Readiness run outputs:
- `readiness_bench/results/<runId>.json`
- `readiness_bench/results/<runId>.md`

Each readiness case row in JSON includes:
- `workflow.trace[]` (`attempted`, `status`, `durationMs`, `retriesUsed`, `mode`, `endpoint`, `detail`)
- `workflow.durationBreakdownMs` (`ledger`, `chainlink`, `hedera`, `serviceProbe`, `total`)

Workflow benchmark outputs:
- `reports/<runId>.json`
- `reports/<runId>.md`

Pitch deck assets:
- `pitches/x402Bench_Cannes2026_Judge_Story.pptx`
- `pitches/x402Bench_Cannes2026_Technical_DeepDive.pptx`
- deck generator: `pitches/build_pitch_decks.cjs`

## Project layout

```text
backend/                         FastAPI backend and API endpoints
frontend/                        Next.js dashboard
readiness_bench/
  suite.json                     Readiness suite cases
  docs_sources/                  Official docs source manifests
  docs_cache/                    Built docs packs
  results/                       Readiness run artifacts
scripts/
  run_llm_readiness_benchmark.mjs
  build_docs_pack.mjs
src/
  core/                          Workflow runner
  adapters/                      Hedera / Chainlink / Ledger / probe integrations
```

## Extending the benchmark

1. Add/modify cases in [`readiness_bench/suite.json`](./readiness_bench/suite.json)
2. Add official sources in [`readiness_bench/docs_sources/default_sources.json`](./readiness_bench/docs_sources/default_sources.json)
3. Rebuild docs pack (`npm run docs:build`)
4. Run benchmark and compare results

When adding cases, include:
- `executionMode` (`real` or `decision_only`)
- `requiredSources`
- `challengeTargets`
- `representativeRationale`

## Additional docs

- Architecture: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- Operations: [`docs/OPERATIONS.md`](./docs/OPERATIONS.md)
- Pitch plans: [`docs/PITCH_PLAN.md`](./docs/PITCH_PLAN.md)
- Benchmark card: [`docs/BENCHMARK_CARD.md`](./docs/BENCHMARK_CARD.md)
- Mini paper: [`docs/PAPER.md`](./docs/PAPER.md)

## License

MIT
