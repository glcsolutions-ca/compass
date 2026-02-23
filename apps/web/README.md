# Web App

## Purpose

`apps/web` is the Next.js frontend and same-origin proxy surface for API calls.

## API Proxy Contract

The route handler at `src/app/api/v1/[...path]/route.ts` proxies browser requests to the API:

- forwards only allowlisted request headers
- strips hop-by-hop headers on request and response
- uses a bounded upstream timeout (`10_000ms`)
- returns `500` with `API_BASE_URL_REQUIRED` if `API_BASE_URL` is missing in production
- returns `502` with `UPSTREAM_UNAVAILABLE` when upstream fetch fails

Proxy target rules:

- In `development`/`test`, default target is `http://localhost:3001` when `API_BASE_URL` is unset.
- In `production`, `API_BASE_URL` must be provided.

## Env Table

| Env Var        | Default                                 | Notes                                                         |
| -------------- | --------------------------------------- | ------------------------------------------------------------- |
| `API_BASE_URL` | `http://localhost:3001` (dev/test only) | Runtime proxy target for `/api/v1/*`; required in production. |

Local template: `apps/web/.env.local.example`.

## Next Standalone Build Notes

- `next.config.ts` sets `output: "standalone"`.
- `next.config.ts` sets `eslint.ignoreDuringBuilds=true` because lint is enforced in CI.
- `next.config.ts` transpiles `@compass/sdk`.
- Standalone entrypoint command is `start:standalone`.

## Commands

Exact local commands from `apps/web/package.json`:

- `pnpm --filter @compass/web dev`
- `pnpm --filter @compass/web build`
- `pnpm --filter @compass/web start`
- `pnpm --filter @compass/web start:standalone`
- `pnpm --filter @compass/web lint`
- `pnpm --filter @compass/web test`
- `pnpm --filter @compass/web typecheck`
