# Web App

## Purpose

`apps/web` is the React Router 7 frontend for Compass.
It runs in framework mode with `ssr: false` and follows Frontend Constitution v1.

## Frontend Constitution

Normative architecture and guardrails are defined in:

- `docs/architecture/frontend-constitution.md`
- `docs/adr/TDR-006-frontend-constitution-v1.md`

Key requirements:

- React Router data APIs (`clientLoader`/`clientAction`) for route I/O
- `@compass/sdk` for Compass API calls
- shadcn/Radix primitive component policy
- Tailwind + CSS variable tokens with first-class light/dark mode
- Persistent authenticated shell and URL-driven workspace context

## UI Structure

```text
app/
  shell/
  ui/shadcn/
  ui/icons/
  lib/{api,auth,workspace}/
  styles/globals.css
  routes/
    public.login/
    app.root/
    app.workspaces/
    app.t.$tenantSlug.chat/
```

## Route Surface

- `GET /` -> login route
- `GET /login` -> login route
- `GET /workspaces` -> authenticated workspace directory
- `GET /t/:tenantSlug/chat` -> authenticated tenant chat shell route

## Runtime Behavior

- `/login` shows Entra sign-in and admin-consent messaging.
- Authenticated routes render one persistent shell:
  - left navigation rail
  - center content canvas
  - bottom-right profile menu with workspace switcher + theme toggle + sign-out
- Workspace switching preserves route intent by rewriting tenant slug in URL.

## Env Table

| Env Var             | Default                 | Notes                                                            |
| ------------------- | ----------------------- | ---------------------------------------------------------------- |
| `WEB_PORT`          | `3000`                  | Dev server listen port (`vite server.port`, strict).             |
| `VITE_API_BASE_URL` | `http://localhost:3001` | Dev proxy target for `/v1`, `/health`, `/openapi.json`.          |
| `API_BASE_URL`      | _required in container_ | Runtime Nginx upstream for proxied API paths on the same origin. |

Local template: `apps/web/.env.example`.

## Build and Runtime Notes

- `react-router.config.ts` sets `ssr: false`.
- Build command is `react-router build`.
- Local runtime serves static output from `build/client` on port `3000`.
- Docker runtime serves static output with non-root `nginx` on port `3000`.
- Nginx proxies `/v1/*`, `/health`, and `/openapi.json` before SPA fallback.

## Commands

Exact local commands from `apps/web/package.json`:

- `pnpm --filter @compass/web dev`
- `pnpm --filter @compass/web build`
- `pnpm --filter @compass/web start`
- `pnpm --filter @compass/web lint`
- `pnpm --filter @compass/web test`
- `pnpm --filter @compass/web typecheck`
