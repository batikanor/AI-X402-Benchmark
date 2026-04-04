# Operations Guide

## Execution Modes

### Mode A: Local replay (zero infra dependency)
- Uses relay/webhook stubs and deterministic scenario config.
- Best for fast iteration and UI/demo rehearsal.
- Produces valid benchmark artifacts without chain writes.

### Mode B: Live testnet/devnet
- Hedera `sdk` mode with funded test account.
- Chainlink trigger path through real automation/webhook infra.
- Ledger policy path through external approver or hardware signing.

### Mode C: Hybrid evidence mode
- Live calls for 1-2 showcase scenarios.
- Historical/replay mode for volume scenarios.
- Recommended when hackathon time is limited but judging still expects real infra evidence.

## Faucet and Funding

Use ETHGlobal faucet for wallet/testnet funding where supported:
- https://ethglobal.com/faucet

Recommended order:
1. Fund operator/signer wallets.
2. Confirm balances cover benchmark scenario count.
3. Run one non-strict test.
4. Run strict gate for final artifact.

## Runtime Hardening Settings

- `BENCH_RUN_TIMEOUT_SECONDS`:
  - default `300`
  - clamped to `30..1800`
- `CORS_ALLOW_ORIGINS`:
  - comma-separated allow list for dashboard origins
- `Idempotency-Key` header:
  - enables duplicate-safe run retries (15-minute cache window)

## Sponsor Qualification Checklist

### Hedera
- At least one run with settlement evidence in artifacts.
- Include transaction IDs and confirmation outcomes in scenario notes.

### Chainlink
- Demonstrate orchestration step from real CLI/webhook integration path.
- Include workflow latency and failure handling evidence.

### Ledger
- Demonstrate policy threshold path that requires explicit approval.
- Show blocked/approval-required scenario behavior in report.

## Production Deployment Path

1. Package backend via container (`uvicorn app.main:app`) with read/write volume for `reports/`.
2. Deploy frontend separately (Vercel or equivalent) with `NEXT_PUBLIC_API_BASE_URL`.
3. Add scheduled runs for nightly benchmark regressions.
4. Promote strict score threshold as release gate.

## Runbook

1. `npm run check`
2. `npm run run`
3. `npm run run:strict`
4. `npm run llm:bench`
5. Start API + dashboard and verify `/api/v1/dashboard` + `/api/v1/alignment`
