# Codex App Server Gateway

## Purpose

`apps/codex-app-server` bridges Compass and OpenAI Codex `app-server` over stdio JSON-RPC.
It persists normalized thread/turn/item state in Postgres and streams live events over WebSocket.

## Endpoints

- `POST /v1/threads/start`
- `POST /v1/threads/:threadId/turns/start`
- `POST /v1/threads/:threadId/turns/:turnId/interrupt`
- `GET /v1/threads`
- `GET /v1/threads/:threadId`
- `POST /v1/approvals/:requestId/respond`
- `GET /v1/auth/account`
- `POST /v1/auth/api-key/login`
- `POST /v1/auth/chatgpt/login/start`
- `POST /v1/auth/chatgpt/login/cancel`
- `POST /v1/auth/logout`
- `GET /v1/models`
- `WS /v1/stream?threadId=<id>`

## Env Table

| Env Var                | Default                 | Notes                                             |
| ---------------------- | ----------------------- | ------------------------------------------------- |
| `CODEX_PORT`           | `3010`                  | HTTP/WebSocket listen port.                       |
| `CODEX_HOST`           | `0.0.0.0`               | Listen host.                                      |
| `LOG_LEVEL`            | `info`                  | Fastify logger level.                             |
| `DATABASE_URL`         | unset                   | Postgres connection string for persistence.       |
| `CODEX_BIN_PATH`       | `codex`                 | Path to codex executable.                         |
| `CODEX_HOME`           | `.codex-gateway`        | Persistent codex home path.                       |
| `OPENAI_API_KEY`       | unset                   | Optional service API key.                         |
| `CODEX_CLIENT_NAME`    | `compass_codex_gateway` | `initialize.clientInfo.name` value.               |
| `CODEX_CLIENT_VERSION` | `0.1.0`                 | `initialize.clientInfo.version` value.            |
| `CODEX_START_ON_BOOT`  | `true`                  | If `false`, codex starts lazily on first request. |

## Commands

- `pnpm --filter @compass/codex-app-server dev`
- `pnpm --filter @compass/codex-app-server build`
- `pnpm --filter @compass/codex-app-server start`
- `pnpm --filter @compass/codex-app-server lint`
- `pnpm --filter @compass/codex-app-server test`
- `pnpm --filter @compass/codex-app-server typecheck`
