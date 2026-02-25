# Worker App

## Purpose

`apps/worker` processes asynchronous Service Bus messages for Compass event workflows.

The root `pnpm dev` command does not start the worker by default.
Start it explicitly with `pnpm dev:worker` (or `pnpm dev:all`).

## Queue Processing Lifecycle

1. Load runtime config from environment.
2. Connect to Service Bus using managed identity (`DefaultAzureCredential`).
3. Create a queue receiver from `@azure/service-bus`.
4. Run in `once` mode (bounded batch) or `loop` mode (long-running subscription).
5. Parse each message body against `EventEnvelopeSchema` from `@compass/contracts`.
6. Settle each message as complete, abandon, or dead-letter.

## Env Table

Configuration is parsed in `src/config.ts`.

| Env Var                                 | Default | Notes                                                                           |
| --------------------------------------- | ------- | ------------------------------------------------------------------------------- |
| `SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE` | unset   | Required Service Bus namespace FQDN.                                            |
| `AZURE_CLIENT_ID`                       | unset   | Required user-assigned managed identity client ID.                              |
| `SERVICE_BUS_QUEUE_NAME`                | unset   | Required queue name.                                                            |
| `WORKER_RUN_MODE`                       | `loop`  | Allowed values: `loop`, `once`.                                                 |
| `WORKER_MAX_MESSAGES`                   | `10`    | Positive integer used by `once` mode for `receiveMessages` batch size.          |
| `WORKER_MAX_WAIT_SECONDS`               | `15`    | Positive integer used by `once` mode for long-poll timeout (`maxWaitTimeInMs`). |

Local template: `apps/worker/.env.example`.

For local runs, you also need valid Azure credentials for `DefaultAzureCredential` and queue `Listen` permissions.

## Settlement Behavior

- Valid payloads are completed.
- Invalid payloads are abandoned when delivery attempts are below threshold.
- Invalid payloads are dead-lettered at or above threshold (`deliveryCount >= 5`).
- Current dead-letter reason is `max-delivery-attempts-reached`.

## Commands

Exact local commands from `apps/worker/package.json`:

- `pnpm --filter @compass/worker dev`
- `pnpm --filter @compass/worker build`
- `pnpm --filter @compass/worker start`
- `pnpm --filter @compass/worker lint`
- `pnpm --filter @compass/worker test`
- `pnpm --filter @compass/worker typecheck`
