# Worker App

## Purpose

`apps/worker` processes asynchronous Service Bus messages for Compass event workflows.

## Queue Processing Lifecycle

1. Load runtime config from environment.
2. Connect to Service Bus using managed identity (`DefaultAzureCredential`).
3. Subscribe to configured queue.
4. Parse incoming message body into `EventEnvelope` contract.
5. Complete valid messages; abandon/dead-letter invalid payloads based on delivery count.

## Env Table

Configuration is parsed in `src/config.ts`.

| Env Var                                 | Default          | Notes                                                       |
| --------------------------------------- | ---------------- | ----------------------------------------------------------- |
| `SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE` | unset            | Required Service Bus namespace FQDN.                        |
| `AZURE_CLIENT_ID`                       | unset            | Required user-assigned managed identity client ID.          |
| `SERVICE_BUS_QUEUE_NAME`                | `compass-events` | Queue receiver name.                                        |
| `WORKER_RUN_MODE`                       | `loop`           | `loop` for long-running receiver; `once` for one-shot mode. |
| `WORKER_MAX_MESSAGES`                   | `10`             | Max messages to receive in `once` mode.                     |
| `WORKER_MAX_WAIT_SECONDS`               | `15`             | Max receive wait in `once` mode.                            |

Local template: `apps/worker/.env.example`.

## Retry/Dead-Letter Behavior

- Invalid payloads below max delivery count are abandoned for retry.
- Invalid payloads at max delivery count are dead-lettered.
- Delivery-count classification is handled by `src/classify.ts`.

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
