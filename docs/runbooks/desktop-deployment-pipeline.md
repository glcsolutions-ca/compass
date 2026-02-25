# Desktop Deployment Pipeline Runbook

## Purpose

Operate the Desktop Deployment Pipeline for signed Compass installers:

- macOS arm64 (`.dmg`)
- Windows x64 (`.msi`)

This pipeline follows commit -> automated acceptance test gate -> deployment stage in one workflow run and emits a binary release decision (`YES` or `NO`).
Acceptance includes a desktop-to-backend compatibility contract check so installer releases do not drift from the active cloud API surface.
Desktop deployment is intentionally decoupled from cloud deployment so signing/notarization failures do not block backend releases.

## Canonical Workflow

- Workflow file: `.github/workflows/desktop-deployment-pipeline.yml`
- Triggers:
  - `push` to `main`
  - `workflow_dispatch` replay (`release_candidate_sha`, optional `release_tag`, `web_base_url`, `draft`)

## Stage Topology

1. Commit stage:
   - `desktop-determine-scope`
   - `desktop-commit-test-suite`
   - `desktop-commit-stage`
2. Automated acceptance test gate:
   - `desktop-backend-contract-acceptance`
   - `build-signed-macos`
   - `build-signed-windows`
   - `desktop-automated-acceptance-test-gate`
3. Deployment stage:
   - `publish-desktop-release`
   - `desktop-deployment-stage`
4. Final decision:
   - `desktop-release-decision`

If desktop scope is not required, acceptance/deployment return explicit `not-required` semantics and final decision remains releasable.

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
- Deployment publishes the accepted installer artifacts.
- Deployment must not rebuild installers.

Canonical artifacts:

- `.artifacts/desktop-release-candidate/<sha>/manifest.json`
- `.artifacts/desktop-automated-acceptance-test-gate/<sha>/result.json`
- `.artifacts/desktop-deployment-stage/<sha>/result.json`
- `.artifacts/desktop-release/<sha>/decision.json`

## Verification Checklist

1. `desktop-automated-acceptance-test-gate` decision is `YES`.
2. desktop backend compatibility contract passed (`/api/v1/health` and `/api/v1/openapi.json`).
3. macOS verification succeeded (`codesign`, `spctl`, notarization stapler validation).
4. Windows Authenticode verification is `Valid`.
5. `publish-desktop-release` produced `.dmg`, `.msi`, and `SHA256SUMS.txt`.
6. `desktop-release-decision` artifact exists and `releasable` is true.

## Failure Recovery

- If release candidate scope/contract fails:
  - fix-forward on `main`, then rerun pipeline.
- If signing fails:
  - verify environment secrets/variables and signing identities.
- If replay is needed:
  - run `desktop-deployment-pipeline.yml` via `workflow_dispatch` with `release_candidate_sha`.

## Rollback

Desktop rollback is release-asset level:

1. Mark bad release as draft or remove assets.
2. Replay/publish a prior accepted release candidate with a new release tag.
3. Keep decision artifacts for both bad and corrected releases.
