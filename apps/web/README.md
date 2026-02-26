# Web App

## Purpose

`apps/web` is the React Router 7 frontend for Compass.
It runs in framework mode with `ssr: false`, producing a client-rendered SPA.

## UI Structure

- `app/root.tsx` defines the root HTML layout and app outlet.
- `app/routes.ts` defines the route manifest.
- `app/routes/home.tsx` loads API health in a route `clientLoader` and renders connectivity state.
- `src/routes/home.test.tsx` verifies URL normalization, loader success/failure handling, payload validation, and UI states.

## Runtime Behavior

The home route:

- resolves API base URL from `VITE_API_BASE_URL`
- falls back to `http://localhost:3001` when unset
- trims trailing slash characters on the resolved base URL
- calls `GET /health` from the route `clientLoader` with request cancellation support
- validates payload shape before rendering status/timestamp diagnostics
- renders status, timestamp, and request error diagnostics

## Env Table

Configuration is consumed in `app/routes/home.tsx`.

| Env Var             | Default                 | Notes                                                             |
| ------------------- | ----------------------- | ----------------------------------------------------------------- |
| `WEB_PORT`          | `3000`                  | Dev server listen port (`vite server.port`, strict).              |
| `VITE_API_BASE_URL` | `http://localhost:3001` | Runtime API base URL for `GET /health`; trailing slash is trimmed |

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
