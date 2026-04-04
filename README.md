# x402Bench LLM Readiness Benchmark

Production-oriented benchmark suite for AI payment flows across a multi-layer trust path:
- Ledger policy/approval gates
- Chainlink orchestration path
- Hedera settlement execution
- x402 service probe verification

## Why this exists

Agentic payment systems are often demoed with one happy-path transaction. Teams still lack repeatable benchmarks for:
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
- Integrated LLM readiness runner (decision correctness + real workflow execution in one score)

## Standards and Best-Practice Alignment

See `docs/ARCHITECTURE.md` and `/api/v1/alignment` for the full mapping to:
- Hedera transaction/mirror node references
- Chainlink operations responsibilities and automation best practices
- Ledger clear-signing guidance
- EIP-712 / EIP-7730 typed-signing standards

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
- `npm run llm:bench`: run real Ollama LLM benchmark on `gemma4:e4b`
- `npm run readiness:bench`: run integrated LLM readiness benchmark across 2+ models

## Integrated readiness benchmark

Use local Ollama models and real workflow integrations in one run:

```bash
npm run readiness:bench
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
