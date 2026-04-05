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
- Run ID: `x402-readiness-20260405062330-2f907119`
- Source file: `readiness_bench/results/x402-readiness-20260405062330-2f907119.json`
- Started: `2026-04-05T06:23:30.997Z`
- Finished: `2026-04-05T06:32:19.120Z`
- Runtime: `openai_compat` (OpenRouter/OpenAI-compatible)
- Models: `6`
- Total evaluations: `144` (`12 cases × 2 doc modes × 6 models`)

### Model scores (with docs context)

| Rank | Model | Overall | Policy Quality % | Strict Match % | Required Docs Coverage % | Gate Eligible % | Executed Pass % | Mean E2E Latency (ms) |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | `openai/gpt-5.4-mini` | 54.81 | 73.37 | 8.33 | 0.00 | 8.33 | 0.00 | 1227.10 |
| 2 | `meta-llama/llama-3.1-8b-instruct` | 54.18 | 70.35 | 33.33 | 0.00 | 33.33 | 0.00 | 3557.42 |
| 3 | `openai/gpt-5.4-nano` | 52.64 | 70.35 | 16.67 | 5.56 | 16.67 | 0.00 | 1672.55 |
| 4 | `google/gemma-2-9b-it` | 50.15 | 67.28 | 16.67 | 0.00 | 16.67 | 0.00 | 1543.30 |
| 5 | `qwen/qwen3-8b` | 44.02 | 60.35 | 16.67 | 0.00 | 16.67 | 0.00 | 11812.83 |
| 6 | `qwen/qwen2.5-coder-7b-instruct` | 2.86 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 1496.69 |

### Model scores (without docs context)

| Rank | Model | Overall | Policy Quality % | Strict Match % | Required Docs Coverage % | Gate Eligible % | Executed Pass % | Mean E2E Latency (ms) |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | `qwen/qwen3-8b` | 63.67 | 86.25 | 33.33 | 0.00 | 33.33 | 0.00 | 11153.67 |
| 2 | `google/gemma-2-9b-it` | 60.82 | 81.80 | 33.33 | 0.00 | 41.67 | 0.00 | 2165.92 |
| 3 | `openai/gpt-5.4-mini` | 59.95 | 82.17 | 16.67 | 0.00 | 16.67 | 0.00 | 1245.25 |
| 4 | `meta-llama/llama-3.1-8b-instruct` | 57.12 | 74.81 | 25.00 | 0.00 | 25.00 | 0.00 | 1857.98 |
| 5 | `openai/gpt-5.4-nano` | 52.29 | 72.53 | 8.33 | 0.00 | 25.00 | 0.00 | 1822.07 |
| 6 | `qwen/qwen2.5-coder-7b-instruct` | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 3199.91 |

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
- Chainlink webhook URL (or use API fallback wiring)
- Ledger approver URL (or use API fallback wiring)

For hosted readiness runs (recommended):
- `OPENROUTER_API_KEY` (required)
- `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`
- `OPENROUTER_REFERER` and `OPENROUTER_TITLE` (optional but recommended)
- `X402BENCH_MODEL_TIMEOUT_MS=90000` (recommended to avoid stalled provider calls hanging a run)

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
