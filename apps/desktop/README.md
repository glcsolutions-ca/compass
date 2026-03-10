# Desktop Host

The desktop app is a thin Electron host for the Compass web product shell.

Current ownership:

- `src/main`: Electron main-process bootstrap
- `src/preload`: renderer bridge surface
- `src/renderer`: reserved for renderer-only host assets when needed

The product UI lives in `apps/web/app`; desktop-specific code here should stay limited to shell and
platform integration concerns.

## Local usage

- `pnpm dev:desktop` starts the local API/web stack if needed, then launches Electron.
- `pnpm dev` is the default browser-hosted local experience.
- `pnpm --filter @compass/desktop build` compiles the main and preload bundles.
- `pnpm --filter @compass/desktop start` launches the compiled desktop host.

The desktop host now registers the `ca.glsolutions.compass://` protocol handler, routes desktop auth
handoffs back into `/v1/auth/desktop/complete`, and exposes the runtime-account bridge expected by
the web product shell.
