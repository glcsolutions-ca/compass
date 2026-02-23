# Worker App

## Purpose

`apps/worker` processes asynchronous Service Bus messages for Compass event workflows.

## Queue Processing Lifecycle

1. Load runtime config from environment.
2. If connection string is missing, run in dry mode (no queue subscription).
3. Subscribe to configured queue.
4. Parse incoming message body into `EventEnvelope` contract.
5. Process message with idempotency tracking and attempt-based routing.
6. Complete, abandon, or dead-letter the message based on processing result.

## Env Table

Configuration is parsed in `src/config/index.ts`.

| Env Var                               | Default          | Notes                                                       |
| ------------------------------------- | ---------------- | ----------------------------------------------------------- |
| `AZURE_SERVICE_BUS_CONNECTION_STRING` | unset            | Required for active queue processing; unset means dry mode. |
| `SERVICE_BUS_QUEUE_NAME`              | `compass-events` | Queue receiver name.                                        |
| `MAX_EVENT_ATTEMPTS`                  | `5`              | Maximum attempts before dead-letter result.                 |

Local template: `apps/worker/.env.example`.

## Idempotency + Retry/Dead-Letter Behavior

- Idempotency uses in-memory message ID tracking (`InMemoryIdempotencyStore`).
- Duplicate message IDs are completed without reprocessing.
- Invalid payloads are dead-lettered with reason `invalid_payload`.
- Messages at or above max attempts are dead-lettered with reason `max_attempts`.
- Transient failures return `retry` and are abandoned for redelivery.

## Message Contract Dependency

The worker validates queue payloads using `EventEnvelopeSchema` from `@compass/contracts`.

## Commands

Exact local commands from `apps/worker/package.json`:

- `pnpm --filter @compass/worker dev`
- `pnpm --filter @compass/worker build`
- `pnpm --filter @compass/worker start`
- `pnpm --filter @compass/worker lint`
- `pnpm --filter @compass/worker test`
- `pnpm --filter @compass/worker typecheck`
