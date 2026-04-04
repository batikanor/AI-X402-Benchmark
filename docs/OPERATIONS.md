# Operations Guide

## 1) Operating modes

### Mode A: Local replay / fallback-first
- Fastest setup for iteration and UI demos.
- Uses local fallback endpoints where explicit sponsor URLs are missing.
- Produces benchmark artifacts with deterministic behavior.

### Mode B: Live testnet/devnet validation
- Hedera in `sdk` mode with funded testnet account.
- Chainlink integration via explicit webhook/CRE-facing endpoint.
- Ledger integration via explicit approver endpoint or hardware path.
- Best evidence quality for judging.

### Mode C: Hybrid evidence mode
- Keep most runs local for speed.
- Execute selected showcase cases with live integration.
- Recommended for hackathon time constraints.

## 2) Pre-run checklist

1. `cp .env.example .env`
2. Confirm Hedera keys/network and recipient account IDs.
3. Confirm Chainlink and Ledger URLs or accept fallback mode.
4. Build docs pack from official sources:
   - `npm run docs:build`
5. Validate config:
   - `npm run check`
6. Diagnose active mode env requirements:
   - `npm run env:diagnose`

Manual actions discovered during unattended loops are appended to:
- `../../runtime/manual_input_requests.md` (workspace-level, outside repo)

## 3) Running benchmark

### Local Ollama run

```bash
npm run readiness:bench
```

### Wider model sweep

```bash
npm run readiness:bench:wide
```

### Hosted OpenAI-compatible runtime

```bash
export HF_TOKEN=hf_xxx
npm run readiness:bench:hf
```

## 4) API + UI runtime

```bash
# API
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
npm run api:start

# UI
npm --prefix frontend install
npm --prefix frontend run dev -- --port 46211
```

## 5) Reliability and conflict handling

- Readiness run endpoint is serialized: only one run executes at a time.
- If a run is already active, concurrent requests may return timeout/conflict depending on wait window.
- Use `Idempotency-Key` for duplicate-safe retries from scripts/clients.

If you see `409` during run trigger, wait for active run to finish or retry with the same idempotency key.

Readiness endpoint behavior:
- HTTP `200` with `ok=false, returnCode=409`: another readiness run is already active.
- HTTP `409`: lock wait timeout on non-readiness endpoints.

## 6) Artifact and report protocol

Per run archive:
- `readiness_bench/results/<runId>.json`
- `readiness_bench/results/<runId>.md`

For shareable benchmark evidence, include:
- suite name/version
- release tag
- model list and runtime
- runs per scenario
- docs pack name/version/source count
- execution denominator (`executed pass/total`)

## 7) Sponsor qualification evidence

### Hedera
- include real settlement evidence (tx hash/status) for at least one execution case.

### Chainlink
- include orchestration evidence and workflow status under retry/failure conditions.

### Ledger
- include threshold/approval behavior and clear policy-block outcomes.

## 8) Security and handling notes

- Use testnet credentials only.
- Keep `.env` out of version control.
- Prefer rotating temporary credentials after event demos.

## 9) Demo-day minimal command path

1. `npm run docs:build`
2. `npm run readiness:bench`
3. start API + UI
4. open dashboard and present:
   - challenge map
   - model ranking
   - selected-model scenario audit
   - sponsor breakdown
