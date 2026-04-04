# 4-Minute Pitch Plan: x402Bench Agentic Payments Benchmark

## Positioning

x402Bench is a benchmark infrastructure product for agentic commerce teams. It proves whether autonomous payment workflows are safe and production-ready before deployment.

## Slide-by-Slide Plan

## 0:00-0:35 Problem
- Agentic payment demos exist, but teams lack measurable reliability/safety gates.
- Current releases are opinion-based, not benchmark-based.

## 0:35-2:10 Live Demo
1. Run benchmark suite (`npm run run`).
2. Show per-scenario flow:
   - Ledger policy check
   - Chainlink workflow run
   - Hedera settlement
   - service probe
3. Open generated report and scorecard.

## 2:10-2:55 Why This Is Not a Hackathon Toy
- Config-driven benchmark scenarios.
- CI-ready strict mode (`run:strict`) with score threshold gate.
- Integration-ready adapters for real infra.

## 2:55-3:35 Sponsor Mapping
- **Hedera**: real settlement and tx evidence.
- **Chainlink**: CRE orchestration step.
- **Ledger**: policy + approval gate for high-value actions.

## 3:35-4:00 Traction Story
- Open-source benchmark corpus.
- Public leaderboard/report publication path.
- Post-hackathon plan: hosted benchmark control plane.

## Live Demo Checklist

- `.env` configured for selected integration modes.
- At least one high-value scenario to show approval path.
- Generated report open in browser/editor before pitch.
- Fallback: run with relay/webhook endpoints if hardware device unavailable.
