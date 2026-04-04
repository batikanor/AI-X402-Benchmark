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

Each readiness run now executes both modes for every selected model and case, then reports:
- per-mode leaderboards
- per-model deltas (`with_docs - without_docs`)

## Scoring model

Per-case scoring combines:
- base policy accuracy
- controls F1
- parse success
- docs grounding and citation quality (if docs are enabled)

Execution eligibility gate for `real` cases requires:
- expected policy for case is `allow`
- parseable JSON output
- decision, approval, priority, risk all match
- controls F1 >= 60

Suite-level model score is weighted in `modelSummaryRows()`:
- with docs enabled:
  - base policy 21%
  - controls F1 18%
  - parse rate 10%
  - strict full match 10%
  - executed workflow success 11%
  - docs grounding 12%
  - required-source coverage 9%
  - citation validity 5%
  - latency score 4%
- with docs disabled:
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
- Ollama (for local runtime)

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

For OpenAI-hosted readiness runs:
- `OPENAI_API_KEY` (required)
- `OPENAI_BASE_URL=https://api.openai.com/v1` (recommended explicit default)

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
  --models qwen3:4b-instruct,phi4:14b \
  --doc-modes with_docs,without_docs
```

Wider model set:

```bash
npm run readiness:bench:wide
```

Hosted OpenAI-compatible endpoint (HF Router example):

```bash
export HF_TOKEN=hf_xxx
npm run readiness:bench:hf
```

Official OpenAI cheap mini/nano run:

```bash
# requires OPENAI_API_KEY in .env
npm run readiness:bench:openai-cheap
```

Mixed-provider run in one benchmark (OpenAI + local Ollama):

```bash
node scripts/run_llm_readiness_benchmark.mjs \
  --config config/benchmark.config.json \
  --suite readiness_bench/suite.json \
  --runtime openai_compat \
  --api-base-url https://api.openai.com/v1 \
  --api-key-env OPENAI_API_KEY \
  --models gpt-5.4-mini,gpt-5.4-nano,qwen3:4b-instruct,qwen2.5:0.5b
```

Routing rules:
- OpenAI-style IDs (for example `gpt-5.4-mini`) use the OpenAI-compatible endpoint.
- Ollama-style tags (for example `qwen3:4b-instruct`) run locally through Ollama.
- Optional explicit prefixes are supported: `openai:<model>` or `ollama:<model>`.

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

`ui:health` validates that the HTML and linked CSS both return `200` so you do not get an unstyled page.

Optional (local UI iteration only):

```bash
npm run ui:dev
```

## Artifacts

Readiness run outputs:
- `readiness_bench/results/<runId>.json`
- `readiness_bench/results/<runId>.md`

Workflow benchmark outputs:
- `reports/<runId>.json`
- `reports/<runId>.md`

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
