# Operations Guide

## Modes

### Hedera
- `sdk`: direct transfer via `@hashgraph/sdk` and operator key.
- `relay`: submit payment job to a relay endpoint.

### Chainlink
- `cli`: execute CRE CLI simulation command.
- `webhook`: invoke a workflow endpoint managed by your team.

### Ledger
- `external_approver`: call internal approval service.
- `ledger_hw`: connect Ledger device and sign challenge.

## Using ETHGlobal Faucet

For testnet setup and funding wallets, use:
- https://ethglobal.com/faucet

Recommended sequence:
1. Fund Hedera test account and any relay signer account.
2. Verify account has enough balance for scenario count.
3. Run benchmark once in non-strict mode, then strict mode.

## CI Gate

Use strict mode in CI:

```bash
npm run run:strict
```

Exit behavior:
- `0`: score passes threshold.
- `2`: score below threshold.
- `1`: config/runtime error.
