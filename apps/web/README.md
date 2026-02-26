# Web App

## Purpose

`apps/web` is the React Router 7 frontend for Compass.
It runs in framework mode with `ssr: false`, producing a client-rendered SPA with Entra-first login and tenant-scoped routes.

## UI Structure

- `app/root.tsx` defines the root HTML layout and app outlet.
- `app/routes.ts` defines the route manifest.
- `app/routes/login.tsx` renders the front-door login route (`/` and `/login`) and builds the Entra start link.
- `app/routes/workspaces.tsx` loads `/v1/auth/me` and renders organization chooser behavior.
- `app/routes/tenant.tsx` renders tenant-scoped route shell (`/t/:tenantSlug/*`).
- `src/routes/home.test.tsx` currently covers baseline route utility behavior.

## Runtime Behavior

- `/` and `/login` show the Entra sign-in entrypoint.
- `/workspaces` calls `GET /v1/auth/me` and renders:
  - unauthenticated state with a login action
  - empty-membership onboarding prompt
  - tenant links when memberships are present
- `/t/:tenantSlug/*` renders the active tenant slug shell.

## Env Table

Configuration is consumed in `app/routes/home.tsx`.

| Env Var             | Default                 | Notes                                                |
| ------------------- | ----------------------- | ---------------------------------------------------- |
| `WEB_PORT`          | `3000`                  | Dev server listen port (`vite server.port`, strict). |
| `VITE_API_BASE_URL` | `http://localhost:3001` | Optional API origin override for browser runtime.    |

Local template: `apps/web/.env.example`.

## Build and Runtime Notes

- `react-router.config.ts` sets `ssr: false`.
- Build command is `react-router build`.
- Local runtime command serves static output from `build/client` on port `3000`.
- Docker runtime serves static output with non-root `nginx` on port `3000`.
- SPA fallback is configured with `try_files $uri /index.html` in `apps/web/nginx/default.conf`.
- Docker build supports overriding `VITE_API_BASE_URL` via build arg.

## Commands

Exact local commands from `apps/web/package.json`:

- `pnpm --filter @compass/web dev`
- `pnpm --filter @compass/web build`
- `pnpm --filter @compass/web start`
- `pnpm --filter @compass/web lint`
- `pnpm --filter @compass/web test`
- `pnpm --filter @compass/web typecheck`
