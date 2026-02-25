# Applications

## Purpose

The `apps/` directory contains the runtime services for Compass:

- API service (`apps/api`) for HTTP system endpoints and contract-backed responses.
- Web service (`apps/web`) for the React Router browser UI.
- Worker service (`apps/worker`) for asynchronous Service Bus processing.
- Codex gateway service (`apps/codex-app-server`) for Codex app-server orchestration and stream APIs.
- Desktop app (`apps/desktop`) for Electron-based macOS/Windows distribution.

## Service Topology

1. Web serves UI on port `3000` and calls the API using `VITE_API_BASE_URL` (default `http://localhost:3001`).
2. API serves `/health`, `/openapi.json`, and `/v1/ping` on port `3001`.
3. Codex gateway serves Codex thread/turn APIs and websocket event streaming on port `3010`.
4. Worker consumes Service Bus events and settles messages (complete, abandon, dead-letter).
5. Desktop hosts the web UI inside Electron and exposes preload-only desktop APIs.

## Directory Map

| Path                     | Responsibility                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `apps/api/`              | Express API, env parsing, health/OpenAPI/ping routes, and integration tests.                |
| `apps/web/`              | React Router app, home route health checks, and client runtime build output.                |
| `apps/codex-app-server/` | Express codex gateway, stdio JSON-RPC bridge, websocket stream hub, thin in-memory adapter. |
| `apps/worker/`           | Service Bus consumer, message schema validation, and retry/dead-letter settlement logic.    |
| `apps/desktop/`          | Electron main/preload runtime, installer packaging, desktop release flow.                   |

## Local Ports and Env Files

| Service       | Local Port           | Env Example File                     |
| ------------- | -------------------- | ------------------------------------ |
| API           | `3001`               | `apps/api/.env.example`              |
| Web           | `3000`               | `apps/web/.env.example`              |
| Codex gateway | `3010`               | `apps/codex-app-server/.env.example` |
| Worker        | N/A (queue consumer) | `apps/worker/.env.example`           |
| Desktop       | N/A (native shell)   | N/A (release workflow inputs)        |

## Where To Change What

- API behavior/config: [`apps/api/README.md`](./api/README.md)
- Web behavior/config: [`apps/web/README.md`](./web/README.md)
- Codex gateway behavior/config: [`apps/codex-app-server/README.md`](./codex-app-server/README.md)
- Worker queue processing: [`apps/worker/README.md`](./worker/README.md)
- Desktop runtime/release: [`apps/desktop/README.md`](./desktop/README.md)
