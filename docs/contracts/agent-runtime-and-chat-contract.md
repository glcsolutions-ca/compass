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

## Turn Lineage And Idempotency

- `POST /v1/agent/threads/{threadId}/turns` accepts optional lineage and idempotency fields:
  - `clientRequestId`
  - `parentTurnId`
  - `sourceTurnId`
- `AgentTurn` responses include optional lineage metadata:
  - `parentTurnId`
  - `sourceTurnId`
  - `clientRequestId`
- Event payloads for `turn.started`, `item.delta`, and `turn.completed` may include:
  - `userMessageId`
  - `assistantMessageId`
  - lineage metadata (`parentTurnId`, `sourceTurnId`, `clientRequestId`)
- Persistence contract for `agent_turns` includes:
  - `parent_turn_id`
  - `source_turn_id`
  - `client_request_id`
- Idempotent submit behavior is enforced by the partial unique key on `(thread_id, client_request_id)` when request id is present.

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
