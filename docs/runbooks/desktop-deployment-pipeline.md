# Desktop Deployment Pipeline Runbook

## Purpose

Operate the desktop Deployment Pipeline for signed Compass installers:

- macOS arm64 (`.dmg`)
- Windows x64 (`.msi`)

This pipeline follows commit -> acceptance -> production in one workflow run and emits a binary release decision (`YES` or `NO`).

## Canonical Workflow

- Workflow file: `.github/workflows/desktop-deployment-pipeline.yml`
- Triggers:
  - `push` to `main`
  - `workflow_dispatch` replay (`candidate_sha`, optional `release_tag`, `web_base_url`, `draft`)

Compatibility lane:

- `.github/workflows/desktop-release.yml` remains manual for one transition cycle only.

## Stage Topology

1. Commit stage:
   - `desktop-determine-scope`
   - `desktop-fast-feedback`
   - `desktop-commit-stage`
2. Acceptance stage:
   - `build-signed-macos`
   - `build-signed-windows`
   - `desktop-acceptance-stage`
3. Production stage:
   - `publish-desktop-release`
   - `desktop-production-stage`
4. Final decision:
   - `desktop-release-decision`

If desktop scope is not required, acceptance/production return explicit `not-required` semantics and final decision remains releaseable.

## Required GitHub Environment

Create/protect `desktop-release` with required reviewers.
Desktop signing/publishing jobs run in this environment.

## Required Secrets and Variables

macOS signing/notarization:

- Secrets:
  - `MACOS_SIGNING_CERT_P12_BASE64`
  - `MACOS_SIGNING_CERT_PASSWORD`
  - `APPLE_API_KEY_P8_BASE64`
  - `APPLE_API_KEY_ID`
  - `APPLE_API_ISSUER_ID`
  - `APPLE_TEAM_ID`

Windows signing (Azure Artifact Signing):

- Secrets:
  - `AZURE_CLIENT_ID`
- Variables:
  - `AZURE_TENANT_ID`
  - `AZURE_SUBSCRIPTION_ID`
  - `TRUSTED_SIGNING_ENDPOINT`
  - `TRUSTED_SIGNING_ACCOUNT_NAME`
  - `TRUSTED_SIGNING_PROFILE_NAME`

Desktop runtime config:

- Variable:
  - `DESKTOP_WEB_BASE_URL` (used when no `web_base_url` dispatch input is provided)
- Contract:
  - start URL must be non-empty HTTPS (`COMPASS_DESKTOP_START_URL`)

## Build-Once / Promote-Same Contract

- Acceptance builds signed macOS/Windows installers once.
- Production publishes the accepted installer artifacts.
- Production must not rebuild installers.

Canonical artifacts:

- `.artifacts/desktop-candidate/<sha>/manifest.json`
- `.artifacts/desktop-acceptance/<sha>/result.json`
- `.artifacts/desktop-production/<sha>/result.json`
- `.artifacts/desktop-release/<sha>/decision.json`

## Verification Checklist

1. `desktop-acceptance-stage` decision is `YES`.
2. macOS verification succeeded (`codesign`, `spctl`, notarization stapler validation).
3. Windows Authenticode verification is `Valid`.
4. `publish-desktop-release` produced `.dmg`, `.msi`, and `SHA256SUMS.txt`.
5. `desktop-release-decision` artifact exists and `releaseable` is true.

## Failure Recovery

- If candidate scope/contract fails:
  - fix-forward on `main`, then rerun pipeline.
- If signing fails:
  - verify environment secrets/variables and signing identities.
- If replay is needed:
  - run `desktop-deployment-pipeline.yml` via `workflow_dispatch` with `candidate_sha`.

## Rollback

Desktop rollback is release-asset level:

1. Mark bad release as draft or remove assets.
2. Replay/publish a prior accepted candidate with a new release tag.
3. Keep decision artifacts for both bad and corrected releases.
