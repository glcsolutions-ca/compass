# Desktop App

## Purpose

`apps/desktop` provides the Electron shell for Compass desktop delivery on macOS and Windows.
The renderer is the existing web app loaded from `COMPASS_DESKTOP_START_URL` in packaged builds.

## Security Model

- `contextIsolation: true`
- `sandbox: true`
- `nodeIntegration: false`
- preload-only API via `window.compassDesktop`

The main process blocks in-app navigation to unknown origins and only allows `https:`/`mailto:`
for external URL opens.

## Runtime Configuration

Required for installer builds:

- `COMPASS_DESKTOP_START_URL`: HTTPS base URL loaded by the packaged app.

Signing/notarization is enabled only when Apple signing env vars are present (`APPLE_TEAM_ID`, key id/issuer/path).
Without these vars, macOS packaging produces an unsigned DMG suitable for temporary local testing.

Optional:

- `COMPASS_DESKTOP_ALLOWED_ORIGINS`: comma-separated list of allowed HTTP(S) origins.

`make:*` scripts write a generated runtime file at `dist/desktop-runtime.json` that is embedded
in packaged artifacts.

## Packaging Dependency Note

Repo-level pnpm policy limits install-time build scripts. Desktop make scripts run `prepack:deps`
to rebuild required native modules (`electron`, `fs-xattr`, `macos-alias`,
`@bitdisaster/exe-icon-extractor`) before packaging.

## Desktop API (preload)

- `window.compassDesktop.getAppVersion(): string`
- `window.compassDesktop.openExternal(url: string): Promise<void>`
- `window.compassDesktop.isDesktop(): true`

## Commands

- `pnpm --filter @compass/desktop build`
- `pnpm --filter @compass/desktop prepack:deps`
- `pnpm --filter @compass/desktop dev:run`
- `pnpm --filter @compass/desktop lint`
- `pnpm --filter @compass/desktop test`
- `pnpm --filter @compass/desktop typecheck`
- `pnpm --filter @compass/desktop make:mac`
- `pnpm --filter @compass/desktop make:win`
