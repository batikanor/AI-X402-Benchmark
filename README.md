# x402Bench Agentic Payments Benchmark

Production-oriented benchmark suite for **agentic pay-per-request commerce** across a multi-layer trust path:
- **Ledger** policy gate and approval control,
- **Chainlink CRE** orchestration path,
- **Hedera** settlement execution,
- and x402-protected service probe verification.

## Why this exists

Agentic payment systems are often demonstrated with one happy-path transaction. Teams still lack consistent benchmarks for:
- reliability under retries,
- p95 latency across orchestration + settlement,
- policy safety behavior,
- and production release readiness.

x402Bench provides a repeatable benchmark harness and scorecard.

## Features

- Config-driven scenario suite (`config/benchmark.config.json`)
- Retry-aware benchmark execution engine
- Multi-dimensional scorecard (reliability, latency, safety, resilience)
- Strict gate mode for CI/release checks
- JSON + Markdown benchmark artifacts
- Pluggable integrations for Hedera, Chainlink, Ledger

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

## Real LLM benchmark

Use local Ollama models for non-mock benchmark evidence:

```bash
npm run llm:bench
```

Outputs are written to `llm_bench/results/*.json` and `llm_bench/results/*.md`.

## Integration notes

### Hedera
- `relay` mode: use a payment relay endpoint.
- `sdk` mode: install `@hashgraph/sdk`, set `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`.

### Chainlink CRE
- `cli` mode: requires CRE CLI available on PATH.
- `webhook` mode: configure `CHAINLINK_WEBHOOK_URL`.

### Ledger
- `external_approver` mode: internal approval endpoint.
- `ledger_hw` mode: install Ledger transport packages and connect a device.

## Hackathon usage

- Fund test accounts via faucet if needed: https://ethglobal.com/faucet
- Keep at least one high-value scenario to demonstrate approval controls.
- Use generated Markdown report as a live judging artifact.

## Output

Each run writes:
- `reports/<runId>.json`
- `reports/<runId>.md`

## License

MIT
