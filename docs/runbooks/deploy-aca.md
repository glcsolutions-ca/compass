# ACA Deploy Runbook

## Purpose

Run a deterministic release pipeline on `main` that converges production to the latest head SHA:

- `azure/container-apps-deploy-action` for API and Web
- private ACR images promoted by immutable digest refs
- managed-identity image pulls (`AcrPull`) at runtime
- migration execution through ACA Job inside the VNet using the API image
- post-deploy API smoke and browser evidence

## Deploy Cycle (Plain-English)

1. `classify` decides `checks`, `infra`, or `runtime`.
2. `checks` validates control-plane/docs changes with no production mutation.
3. `promote` handles all production mutations under `environment: production`.
4. Runtime changes build once, promote digests, run migration, then deploy API/Web.
5. Infra changes apply Bicep and optionally roll active revisions.
6. Smoke evidence and artifacts are written for every promoted candidate.

## Non-Commit Rule

Do not commit organization-specific infrastructure values in this repository.
All concrete deploy values must be stored in the GitHub `production` environment (`vars` and `secrets`), not in tracked files.

## Workflow

- Main workflow file: `.github/workflows/deploy.yml`
- Main workflow name: `Release Candidate (main)`
- Trigger: `push` to `main`, `workflow_dispatch`
- Job model: `classify -> checks -> promote -> report`
- Concurrency: serialized only on `promote` (`prod-main`)
- GitHub environment: `production` only on `promote`
- Infra helper workflow: `.github/workflows/infra-apply.yml` (`workflow_call` + manual dispatch, no push trigger)

## Required GitHub Environment Variables (`production`)

- `AZURE_TENANT_ID=<tenant-guid>`
- `AZURE_SUBSCRIPTION_ID=<subscription-guid>`
- `AZURE_RESOURCE_GROUP=<resource-group-name>`
- `ACA_API_APP_NAME=<container-app-api-name>`
- `ACA_WEB_APP_NAME=<container-app-web-name>`
- `ACA_MIGRATE_JOB_NAME=<container-app-job-name>`
- `ACR_NAME=<acr-name>`

## Required GitHub Environment Secrets (`production`)

- `AZURE_DEPLOY_CLIENT_ID`

## Runtime Sizing and Revision Policy

- API and Web are configured for cost-first runtime:
  - `cpu: 0.25`
  - `memory: 0.5Gi`
  - `minReplicas: 0`
  - `maxReplicas: 1`
- API and Web run in `activeRevisionsMode: single`.
- API and Web keep at most `maxInactiveRevisions: 2` for short rollback depth without revision sprawl.
- In single-revision mode, ACA routes app traffic to the latest ready revision automatically.
- These drift assertions are operational guardrails for the current cost-first posture (no override mode).

## Web/API Boundary (Standardized)

- Browser requests stay same-origin and call `/api/v1/*` on the Web app.
- The Web app route handler proxies those requests to the API app using runtime `API_BASE_URL`.
- Proxy forwarding is intentionally minimal: allowlisted request headers only, hop-by-hop headers stripped, and bounded upstream timeout.
- Do not use `NEXT_PUBLIC_*` token or API URL wiring for production/CI smoke behavior.
- Browser evidence validates baseline UI flow and no longer depends on token injection.

## App Topology Decision

- API and Web remain separate Container Apps.
- Do not merge API and Web into one app with sidecars or init containers.
- Rationale:
  - separate apps keep independent rollout/failure boundaries and avoid ingress/port coupling complexity
  - sidecars are for tightly coupled support processes, not for consolidating unrelated front-end/API workloads
  - migrations remain finite gate tasks and stay in ACA Jobs
- Startup migrations are not allowed on API or Web containers in production.

## Registry + Runtime Auth Contract

- Production images are stored in ACR only.
- ACR is provisioned with `adminUserEnabled=false`.
- Deploy workflow authenticates to Azure via OIDC and pushes images to ACR.
- ACR login server is derived in workflow as `${ACR_NAME}.azurecr.io`.
- ACA API/Web/Job resources pull images through managed identity (shared user-assigned pull identity).
- `AcrPull` role assignment for the shared pull identity is provisioned by Bicep (`infra/azure/main.bicep`).
- Decision record: `docs/adr/TDR-002-production-container-registry-strategy.md`.
- Under managed-identity-only runtime auth, GHCR is not a direct production replacement for ACR.

## Deploy Sequence

1. `classify` computes:
   - `base_sha` (last successful production deployment SHA, with bootstrap fallback)
   - `base_source` (`deployment-record` or `bootstrap-fallback`)
   - `base_deployment_id` (when available)
   - `kind=checks|infra|runtime`
   - `rollout`
   - `needs_infra`
   - `needs_migrations`
2. For `checks`:
   - run factory checks only (`format`, merge-contract unit tests)
   - do not log into Azure and do not mutate production
3. For `infra` or `runtime`, `promote` starts and performs stale-head guard before any mutation.
4. For `infra`:
   - resolve current API/Web digest refs
   - apply infra with those refs
   - optionally restart active revisions when `rollout=true`
   - run smoke verification
5. For `runtime`:
   - optionally apply infra first using current digest refs when `needs_infra=true`
   - build and push API/Web once
   - resolve candidate digest refs (`repo@sha256`)
   - stale-head guard before entering migration+deploy boundary
   - run migration job and then complete API/Web deploy as one atomic boundary (no stale abort in between)
   - run smoke and browser evidence
6. `report` writes release summary artifacts.

## Latest-Head Semantics

- Production converges to the latest `main` head.
- Pending runs may be superseded by newer commits due to GitHub concurrency behavior.
- Stale runs are skipped before irreversible mutation boundaries.
- Classification diff is `base_sha..head_sha`, so skipped pending commits are still included by the next head run.

## Irreversible Boundaries

- Stale guard boundary 1: before infra apply.
- Stale guard boundary 2: before entering migration+deploy boundary (`runtime` only).
- After migration starts, deploy completes for that candidate (no stale abort between migration and deploy).

## ACR Tag Retention

- Workflow file: `.github/workflows/acr-cleanup.yml`
- Trigger: weekly schedule + `workflow_dispatch`
- Default retention policy: keep newest 15 tags for `compass-api` and `compass-web`; prune older tags
- Cleanup artifact: `.artifacts/infra/<sha>/acr-cleanup.json`

## Rollback (Single Revision Mode)

With single revision mode, rollback is image-based, not traffic-split based:

1. Identify the last known-good image tag (typically a prior commit SHA).
2. Run `Infra Apply` manually with `image_tag=<known-good-sha>`.
3. Confirm API/Web use expected image tags and health checks pass.
4. Re-run deploy smoke checks if needed.

## Artifacts

Release summary artifacts are written under `.artifacts/release/<sha>/`:

- `manifest.json` (base/head SHA trace + current refs + candidate refs + kind)
- `result.json` (final status + stale-guard outcomes + deployment IDs)

Deploy artifacts remain under `.artifacts/deploy/<sha>/`:

- `migration-start.json`
- `migration.json`
- `candidate-manifest.json`
- `api-smoke.json`
- `result.json`

Browser evidence remains under `.artifacts/browser-evidence/<sha>/manifest.json`.

Browser evidence timeout policy:

- `BROWSER_SMOKE_PAYLOAD_TIMEOUT_MS` defaults to `45000` in deploy workflow for scale-to-zero cold starts.

`verify-api-smoke.mjs` behavior:

- Always validates `/health` and `/openapi.json`.
- Verifies the generated OpenAPI document includes `/health`.
