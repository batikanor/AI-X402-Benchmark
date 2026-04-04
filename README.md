# x402Bench LLM Readiness Benchmark

Production-oriented benchmark suite for AI payment flows across a multi-layer trust path:
- Ledger policy/approval gates
- Chainlink orchestration path
- Hedera settlement execution
- x402 service probe verification

## Why this exists

AI-driven payment systems are often demoed with one happy-path transaction. Teams still lack repeatable benchmarks for:
- reliability under retries
- p95 latency across orchestration + settlement
- policy safety behavior
- production release readiness

x402Bench provides one integrated readiness benchmark and scorecard.

## Features

- Config-driven scenario suite (`config/benchmark.config.json`)
- Retry-aware benchmark execution engine
- Multi-dimensional scorecard (reliability, latency, safety, resilience)
- Strict gate mode for CI/release checks
- JSON + Markdown benchmark artifacts
- Pluggable integrations for Hedera, Chainlink, Ledger
- Hardened FastAPI backend with idempotency and run locking
- Integrated LLM readiness runner (policy quality + real workflow execution in one score)
- Runtime abstraction: local Ollama or OpenAI-compatible APIs (including Hugging Face Router)
- Hard readiness suite with adversarial/policy-edge cases to avoid inflated 100% scores
- Documentation-grounded evaluation with user-selectable official source packs and citation scoring

## Standards and Best-Practice Alignment

See `docs/ARCHITECTURE.md` and `/api/v1/alignment` for the full mapping to:
- Hedera transaction/mirror node references
- Chainlink operations responsibilities and automation best practices
- Ledger clear-signing guidance
- EIP-712 / EIP-7730 typed-signing standards
- end-to-end system diagram (prompting, docs grounding, scoring weights, execution path)

## Project structure

```text
src/
  adapters/
  core/
  utils/
config/
tests/
docs/
backend/
frontend/
```

## Quickstart

### 1) Prerequisites
- Node.js 20+

### 2) Configure

```bash
cp .env.example .env
```

Populate `.env` according to your selected mode:
- Hedera `sdk` or `relay`
- Chainlink `cli` or `webhook`
- Ledger `external_approver` or `ledger_hw`

### 3) Validate config

```bash
npm run check
```

### 4) Run benchmark

```bash
npm run run
```

### 5) Run strict gate

```bash
npm run run:strict
```

### 6) Start API + dashboard

```bash
# Terminal A
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
npm run api:dev

# Terminal B
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

## Scripts

- `npm run check`: validate benchmark config
- `npm run run`: execute benchmark suite
- `npm run run:strict`: execute benchmark + fail below threshold
- `npm test`: unit tests
- `npm run api:dev`: run FastAPI backend on port 8000
- `npm run ui:dev`: run Next.js frontend on port 3000
- `npm run docs:build`: fetch official docs and build `readiness_bench/docs_cache/default_docs_pack.json`
- `npm run llm:bench`: run real Ollama LLM benchmark on `gemma4:e4b`
- `npm run readiness:bench`: run hard readiness benchmark across 5 local models
- `npm run readiness:bench:wide`: run wider local comparison across 6 models
- `npm run readiness:bench:hf`: run the same benchmark against OpenAI-compatible hosted models (HF Router example)

## Integrated readiness benchmark

Refresh the documentation pack from official sources:

```bash
npm run docs:build
```

Use local Ollama models and real workflow integrations in one run:

```bash
npm run readiness:bench
```

Use OpenAI-compatible hosted models (Hugging Face Router, OpenRouter, or self-hosted compatible endpoint):

```bash
export HF_TOKEN=hf_xxx
npm run readiness:bench:hf
```

You can override docs behavior directly:

```bash
node scripts/run_llm_readiness_benchmark.mjs \
  --config config/benchmark.config.json \
  --suite readiness_bench/suite.json \
  --runtime ollama \
  --models qwen3:4b-instruct,phi4:14b \
  --docs-pack readiness_bench/docs_cache/default_docs_pack.json \
  --docs-top-k 6 \
  --require-citations true \
  --outdir readiness_bench/results
```

Outputs are written to `readiness_bench/results/*.json` and `readiness_bench/results/*.md`.

## Deployability Modes

- Local replay mode: deterministic artifacts, no chain dependency
- Live testnet/devnet mode: real settlement/orchestration/policy proof
- Hybrid mode: combine live showcase scenarios with replay bulk runs

Detailed runbook: `docs/OPERATIONS.md`

## Hackathon usage

- Fund test accounts via faucet if needed: https://ethglobal.com/faucet
- Keep at least one high-value scenario to demonstrate approval controls
- Use generated Markdown report as a live judging artifact

## Output

Each run writes:
- `reports/<runId>.json`
- `reports/<runId>.md`

## License

MIT
