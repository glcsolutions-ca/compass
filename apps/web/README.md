# Web App

Purpose: browser client for workspace, chat, and auth flows.

## Start Here

- routes/components: `apps/web/app/**`
- tests: `apps/web/test/**`
- style rules: `docs/architecture/frontend-constitution.md`

## Run And Test

```bash
pnpm dev
pnpm --filter @compass/web dev
pnpm --filter @compass/web test
```

`pnpm dev` is the default local entrypoint and opens the web app in the browser after the shared local
stack is healthy. Use `pnpm dev -- --no-open` for the same flow without opening a browser tab. Use
`pnpm --filter @compass/web dev` only when you intentionally want the package dev server by itself.

## Source Of Truth

- `docs/architecture/frontend-constitution.md`
- `docs/contracts/entra-sso-and-gateway-auth.md`
