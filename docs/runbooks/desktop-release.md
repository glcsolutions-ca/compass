# Desktop Release Runbook

## Purpose

Release signed Compass desktop installers for:

- macOS arm64 (`.dmg`)
- Windows x64 (`.msi`)

Installers are built from a `main` candidate that already passed the deployment pipeline and are published to GitHub Releases.

## Workflow

- Workflow file: `.github/workflows/desktop-release.yml`
- Trigger: manual `workflow_dispatch`
- Required inputs:
  - `candidate_sha`: accepted candidate SHA on `main`
  - `release_tag`: release tag (for example `desktop-v0.1.0`)
  - `web_base_url`: HTTPS URL loaded by Electron renderer
  - `draft`: publish release as draft (`true`/`false`)
  - `signing_mode`: `signed` (default), `unsigned`, `unsigned-macos`, or `unsigned-windows`

## Required GitHub Environment

Create GitHub Environment `desktop-release` and protect it with required reviewers.

Build jobs (`build-macos`, `build-windows`) run inside this environment.

## Required Secrets And Variables

### macOS signing/notarization

- Secrets:
  - `MACOS_SIGNING_CERT_P12_BASE64`
  - `MACOS_SIGNING_CERT_PASSWORD`
  - `APPLE_API_KEY_P8_BASE64`
  - `APPLE_API_KEY_ID`
  - `APPLE_API_ISSUER_ID`
  - `APPLE_TEAM_ID`

### Windows signing (Azure Artifact Signing)

- Secrets:
  - `AZURE_CLIENT_ID`
- Variables:
  - `AZURE_TENANT_ID`
  - `AZURE_SUBSCRIPTION_ID`
  - `TRUSTED_SIGNING_ENDPOINT`
  - `TRUSTED_SIGNING_ACCOUNT_NAME`
  - `TRUSTED_SIGNING_PROFILE_NAME`

## Signing Policy Modes

Use `signing_mode` to control signing behavior while always producing both installers.

- `signed`: macOS signed/notarized + Windows signed.
- `unsigned`: macOS unsigned + Windows unsigned.
- `unsigned-macos`: macOS unsigned + Windows signed.
- `unsigned-windows`: macOS signed/notarized + Windows unsigned.

Unsigned modes are for internal testing only.

## PNPM Native Build Policy

This repo restricts install-time build scripts by default (`.npmrc`).
Desktop packaging requires native modules used by Electron and DMG/MSI makers.

`desktop-release.yml` sets:

- `npm_config_node_linker=hoisted`
- `npm_config_allow_build_scripts=esbuild,sharp,electron,fs-xattr,macos-alias,@bitdisaster/exe-icon-extractor`

## Execution Steps

1. Confirm deployment pipeline success for the `candidate_sha` on `main`.
2. Start `Desktop Release` workflow with target inputs.
3. Wait for build jobs:
   - `build-macos`: emits renamed DMG (signed/notarized depending on `signing_mode`).
   - `build-windows`: emits MSI (signed depending on `signing_mode`).
4. Validate `publish-release` job:
   - GitHub Release is created/updated by `release_tag`.
   - Assets include one `.dmg`, one `.msi`, and `SHA256SUMS.txt`.
   - Artifact `.artifacts/desktop/<sha>/release-manifest.json` is uploaded.

## Verification Checklist

- macOS verification passed (`codesign`, `spctl`, stapler validation in workflow logs).
- Windows signature status is `Valid` (`Get-AuthenticodeSignature` in workflow logs).
- Release assets are present and checksums file is included.
- Release manifest artifact exists for the same candidate SHA.

## Failure Recovery

- If candidate validation fails:
  - Re-run deployment pipeline for the target SHA on `main`.
  - Retry desktop release workflow.
- If macOS signing/notarization fails:
  - Verify Apple cert/password/API key secrets.
  - Verify Developer ID certificate trust chain.
- If Windows signing fails:
  - Verify Azure OIDC app registration and role assignment.
  - Verify endpoint/account/profile vars match regional Artifact Signing resources.

## Rollback

Installer release rollback is release-asset level, not runtime deployment:

1. Mark bad release as draft or delete release assets.
2. Publish corrected installers with a new release tag.
3. Keep acceptance artifact trail unchanged (candidate remains immutable).
