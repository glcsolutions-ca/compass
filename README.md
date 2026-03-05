# Compass

Purpose: one place to manage work, time, and delivery across the company.

## Quick Start

Requirements:

- Node.js `22.x`
- `pnpm 10.30.1`
- Docker (local Postgres)

```bash
pnpm install
pnpm env:setup
pnpm dev
```

`pnpm dev` runs the full stack in the foreground and auto-stops dependencies (Postgres + runtime) when it exits.

Detached startup:

```bash
pnpm dev:up
```

`pnpm dev:up` starts the full stack in the background, waits for health checks, and writes app logs to `.artifacts/dev/dev-apps.log`.

Manual recovery cleanup:

```bash
pnpm dev:down
```

## Environment Model

Local config is service-owned and layered:

- `apps/api/.env(.local)`
- `apps/web/.env(.local)`
- `apps/codex-session-runtime/.env(.local)`
- `db/postgres/.env(.local)`

Precedence is:

1. `process.env`
2. `.env.local`
3. `.env`

Rules:

- `pnpm env:setup` only creates missing `.env` files from `.env.example` and does not overwrite existing files.
- `pnpm dev` resolves a coherent runtime env map and does not rewrite tracked env files.
- Local Postgres is ephemeral by default.
- `DATABASE_URL` is required at API startup.
- In local dev orchestration, `DATABASE_URL` is derived from the resolved `POSTGRES_PORT` unless explicitly set in `process.env`.
- Local auth defaults to `AUTH_MODE=mock`.
- `WEB_BASE_URL` is the canonical web origin; `ENTRA_REDIRECT_URI` must match that origin and use `/v1/auth/entra/callback`.

## Run And Test

```bash
pnpm env:doctor
pnpm check
pnpm test:full
pnpm build
```
