# Codex App Server Gateway

## Purpose

`apps/codex-app-server` is an Express gateway that bridges Compass and OpenAI Codex `app-server` over stdio JSON-RPC.
It keeps a thin API/websocket adapter layer and uses in-memory state in this v1 cut.

## Endpoints

- `GET /health`
- `POST /v1/threads/start`
- `POST /v1/threads/:threadId/turns/start`
- `POST /v1/threads/:threadId/turns/:turnId/interrupt`
- `POST /v1/approvals/:requestId/respond`
- `GET /v1/auth/account`
- `POST /v1/auth/api-key/login`
- `POST /v1/auth/chatgpt/login/start`
- `POST /v1/auth/chatgpt/login/cancel`
- `POST /v1/auth/logout`
- `GET /v1/models`
- `WS /v1/stream?threadId=<id>`

Deferred from this v1 surface:

- `GET /v1/threads`
- `GET /v1/threads/:threadId`

## Env Table

| Env Var                | Default                 | Notes                                             |
| ---------------------- | ----------------------- | ------------------------------------------------- |
| `CODEX_PORT`           | `3010`                  | HTTP/WebSocket listen port.                       |
| `CODEX_HOST`           | `0.0.0.0`               | Listen host.                                      |
| `LOG_LEVEL`            | `info`                  | Express gateway logger verbosity.                 |
| `CODEX_BIN_PATH`       | `codex`                 | Path to codex executable.                         |
| `CODEX_HOME`           | `.codex-gateway`        | Persistent codex home path.                       |
| `OPENAI_API_KEY`       | unset                   | Optional service API key.                         |
| `CODEX_CLIENT_NAME`    | `compass_codex_gateway` | `initialize.clientInfo.name` value.               |
| `CODEX_CLIENT_VERSION` | `0.1.0`                 | `initialize.clientInfo.version` value.            |
| `CODEX_START_ON_BOOT`  | `true`                  | If `false`, codex starts lazily on first request. |

Optional auth/env fields (for example `OPENAI_API_KEY`, `ENTRA_CLIENT_ID`) treat blank strings as unset.

## OpenAI App-Server Binary

This gateway starts OpenAI's official `codex app-server` binary (see `CODEX_BIN_PATH`).

- Production container builds pin an OpenAI release asset from `https://github.com/openai/codex/releases` and verify `sha256` before install.
- Local development can use the same pinned release as the container:

```bash
pnpm codex:pin:install
export CODEX_BIN_PATH="$(pwd)/.tools/codex/current/codex"
```

## Upgrading Codex

To bump to the latest OpenAI Codex release and update the pinned Docker args:

```bash
pnpm codex:pin:sync
```

To pin a specific release tag instead of latest:

```bash
pnpm codex:pin:sync -- --tag rust-v0.105.0
```

## Commands

- `pnpm --filter @compass/codex-app-server dev`
- `pnpm --filter @compass/codex-app-server build`
- `pnpm --filter @compass/codex-app-server start`
- `pnpm --filter @compass/codex-app-server lint`
- `pnpm --filter @compass/codex-app-server test`
- `pnpm --filter @compass/codex-app-server typecheck`
