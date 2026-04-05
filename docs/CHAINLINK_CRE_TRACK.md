# Chainlink CRE Track Alignment

This document explains how the benchmark aligns with the ETHGlobal Cannes 2026 Chainlink track requirement:

> build/simulate/deploy a workflow using Chainlink CRE tooling and use it meaningfully.

## Official sources

- ETHGlobal Chainlink prizes: <https://ethglobal.com/events/cannes2026/prizes/chainlink>
- Chainlink CRE docs: <https://docs.chain.link/cre>
- Chainlink Automation best practices: <https://docs.chain.link/chainlink-automation/concepts/best-practice>

## What this project executes

For each `executionMode=real` case:
1. policy gate and approval checks run
2. Chainlink orchestration step runs (`chainlink_workflow`)
3. Hedera settlement runs only after Chainlink step succeeds
4. service probe validates post-settlement path

This sequence is implemented in:
- `src/core/runner.js`

## CRE tooling integration points

- `src/adapters/chainlinkCreAdapter.js`
  - `CHAINLINK_MODE=cli` runs CRE CLI
  - `CHAINLINK_CRE_ACTION=simulate|deploy` chooses action
  - default command shape:
    - `cre workflow simulate --input <json>`
    - `cre workflow deploy --input <json>`

Evidence fields persisted in each run result:
- `workflow.trace[].id = chainlink_workflow`
- `workflow.trace[].mode = cli`
- `workflow.trace[].endpoint = <resolved command + args>`
- `workflow.workflowId`
- per-stage duration and retry signals

## How to run CRE profile

```bash
npm run readiness:bench:chainlink-cre
```

or

```bash
npm run readiness:bench:chainlink-cre:deploy
```

Profile config:
- `config/benchmark.chainlink-cre.config.json`

## Notes

- The benchmark suite maps relevant cases to Chainlink prize challenge targets via `challengeTargets`.
- This repo keeps a webhook mode for local fallback, but the CRE profile is explicitly CLI-driven for track alignment.
