# Agent Runtime And Chat Contract

Purpose: contract boundary for agent thread, turn, event, and chat integration behavior.

## Scope

- API and websocket behavior for agent turns/events
- persistence contract for agent runtime tables
- generated contract artifacts consumed by SDK and clients

## Contract Rules

- runtime changes must preserve declared request/response shapes
- event ordering and cursor behavior must remain deterministic
- schema changes require regenerated artifacts

## Validation

```bash
pnpm --filter @compass/contracts generate
pnpm --filter @compass/sdk generate
pnpm contract:check
```

## Failure Mode

- contract drift blocks integration until artifacts and consumers are updated

## Source

- `packages/contracts/**`
- `packages/sdk/**`
