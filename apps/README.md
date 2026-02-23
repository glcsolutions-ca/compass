# Applications

## Purpose

The `apps/` directory contains the runtime services for Compass:

- API service (`apps/api`) for backend endpoints and data access.
- Web service (`apps/web`) for the user-facing Next.js app and API proxy routes.
- Worker service (`apps/worker`) for asynchronous queue processing.

## Service Topology

1. Web serves UI on port `3000` and proxies `/api/v1/*` to the API.
2. API serves backend endpoints on port `3001` and can connect to Postgres when `DATABASE_URL` is set.
3. Worker consumes Service Bus events and processes/retries/dead-letters based on message state.

## Directory Map

| Path           | Responsibility                                                           |
| -------------- | ------------------------------------------------------------------------ |
| `apps/api/`    | Fastify API, config parsing, health/OpenAPI routes, integration tests.   |
| `apps/web/`    | Next.js app, API proxy route handlers, standalone runtime build output.  |
| `apps/worker/` | Service Bus consumer, sync message parsing, idempotent processing logic. |

## Local Ports and Env Files

| Service | Local Port           | Env Example File              |
| ------- | -------------------- | ----------------------------- |
| API     | `3001`               | `apps/api/.env.example`       |
| Web     | `3000`               | `apps/web/.env.local.example` |
| Worker  | N/A (queue consumer) | `apps/worker/.env.example`    |

## Where To Change What

- API behavior/config: [`apps/api/README.md`](./api/README.md)
- Web behavior/proxy contract: [`apps/web/README.md`](./web/README.md)
- Worker queue processing: [`apps/worker/README.md`](./worker/README.md)
