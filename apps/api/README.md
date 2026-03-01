# API App

Purpose: contract-backed HTTP API and agent/runtime gateway endpoints.

## Start Here

- source: `apps/api/src`
- tests: `apps/api/test`
- contract generation: `packages/contracts`

## Run And Test

```bash
pnpm --filter @compass/api dev
pnpm --filter @compass/api test
pnpm --filter @compass/api test:integration
```

## Source Of Truth

- `docs/contracts/agent-runtime-and-chat-contract.md`
- `packages/contracts/**`
