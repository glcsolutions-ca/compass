# Web App

## Purpose

`apps/web` is the React Router 7 frontend for Compass.
It runs in framework mode with `ssr: false` and follows Frontend Constitution v2.

## Frontend Constitution

Normative architecture and guardrails are defined in:

- `docs/architecture/frontend-constitution.md`
- `docs/adr/TDR-006-frontend-constitution-v1.md`

Key requirements:

- React Router `clientLoader`/`clientAction` route APIs for route I/O
- `@compass/sdk` for Compass API calls
- shadcn/Radix primitive component policy
- Tailwind + CSS variable tokens with first-class light/dark + palette theming
- Persistent authenticated shell and URL-driven workspace context

## UI Structure

```text
app/
  app.css
  root.tsx
  routes.ts
  components/{ui,icons,shell}/
  features/{auth,workspace,chat}/
  lib/{api,auth,utils}/
  routes/
    root-redirect/route.tsx
    public/login/route.tsx
    app/layout/route.tsx
    app/automations/route.tsx
    app/skills/route.tsx
    app/workspaces/route.tsx
    app/chat/route.tsx
```

## Route Surface

- `GET /` -> auth-aware redirect route
- `GET /login` -> login route
- `GET /automations` -> authenticated automations placeholder
- `GET /skills` -> authenticated skills placeholder
- `GET /workspaces` -> authenticated workspace directory
- `GET /t/:tenantSlug/chat` -> authenticated tenant chat shell route

## Runtime Behavior

- `/login` shows Entra sign-in and admin-consent messaging.
- Authenticated routes render one persistent shell:
  - left navigation rail
  - top utility cluster (`New thread`, `Automations`, `Skills`)
  - center content canvas
  - sidebar footer profile launcher with `Settings` + `Personalization` + `Help` + `Log out`
- Workspace switching preserves route intent by rewriting tenant slug in URL.
- `New thread` creates a fresh thread context via `?thread=<opaque-id>` in tenant chat routes.
- `Automations` and `Skills` currently ship as polished authenticated placeholder pages.
- Settings modal state is URL-backed with query params:
  - `?modal=settings&section=general`
  - `?modal=settings&section=personalization`

## Theme System (v1)

- HTML contract: `<html data-theme=\"<themeId>\" class=\"dark\">`
- Mode storage key: `ui-mode` (`system | light | dark`)
- Palette storage key: `ui-theme` (`compass | slate | rose`)
- Bootstrapping runs pre-hydration in `app/root.tsx` to avoid first-paint flash.
- Theme controls live in Settings modal under `General > Appearance`.
- Theme preview behavior remains hover-to-preview and click-to-lock.

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
