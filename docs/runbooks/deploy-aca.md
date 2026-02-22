# ACA Deploy Runbook

## Purpose

Deploy every commit on `main` to Azure Container Apps using the standard ACR-backed GitHub Actions flow:

- `azure/container-apps-deploy-action` for API and Web
- private ACR images tagged by commit SHA
- managed-identity image pulls (`AcrPull`) at runtime
- migration execution through ACA Job inside the VNet using the API image
- post-deploy API smoke and browser evidence

## Non-Commit Rule

Do not commit organization-specific infrastructure values in this repository.
All concrete deploy values must be stored in the GitHub `production` environment (`vars` and `secrets`), not in tracked files.

## Workflow

- Workflow file: `.github/workflows/deploy.yml`
- Trigger: `push` to `main`
- Concurrency: serialized (`deploy-main`)
- GitHub environment: `production`

## Required GitHub Environment Variables (`production`)

- `AZURE_TENANT_ID=<tenant-guid>`
- `AZURE_SUBSCRIPTION_ID=<subscription-guid>`
- `AZURE_RESOURCE_GROUP=<resource-group-name>`
- `ACA_API_APP_NAME=<container-app-api-name>`
- `ACA_WEB_APP_NAME=<container-app-web-name>`
- `ACA_MIGRATE_JOB_NAME=<container-app-job-name>`
- `ACR_NAME=<acr-name>`
- `ENTRA_ISSUER=<issuer-url>`
- `ENTRA_JWKS_URI=<jwks-url>`
- `ENTRA_AUDIENCE=<api-audience>`
- `SMOKE_EXPECTED_ACCOUNT_IDENTITY=<employee-id>` (optional; default `employee-123`)
- `SMOKE_REQUIRE_EMPLOYEE_FOUND=<true|false>` (optional; default `false`)

## Required GitHub Environment Secrets (`production`)

- `AZURE_DEPLOY_CLIENT_ID`
- `AZURE_SMOKE_CLIENT_ID`

## Runtime Sizing and Revision Policy

- API and Web are configured for cost-first runtime:
  - `cpu: 0.25`
  - `memory: 0.5Gi`
  - `minReplicas: 0`
  - `maxReplicas: 1`
- API and Web run in `activeRevisionsMode: single`.
- API and Web keep at most `maxInactiveRevisions: 2`.
- In single-revision mode, ACA routes app traffic to the latest ready revision automatically.
- Web app calls API through the stable app FQDN (`https://<api-app>.<aca-default-domain>`), not a revision FQDN.

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

## Deploy Sequence

1. Current-head SHA guard checks workflow SHA still matches `origin/main`.
2. Azure OIDC login (deploy identity).
3. Build/push API image to ACR.
4. Build/push Web image to ACR.
5. Update and execute ACA migration job (`start-migration-job.mjs`, `wait-migration-job.mjs`) using the API image.
6. API deploy via `azure/container-apps-deploy-action` using `imageToDeploy`.
7. Web deploy via `azure/container-apps-deploy-action` using `imageToDeploy`.
8. Drift assertions verify `activeRevisionsMode=single`, `minReplicas=0`, and one active revision per app.
9. Current-head SHA guard runs again before smoke.
10. Azure OIDC login (smoke identity), mint Entra access token.
11. API smoke verification (`verify-api-smoke.mjs`) against production URL.
12. Browser evidence against production Web URL, reusing the same Entra smoke token via Playwright request-header injection (`BROWSER_SMOKE_BEARER_TOKEN`).
13. Publish deploy artifacts.

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

Artifacts are written under `.artifacts/deploy/<sha>/`:

- `migration-start.json`
- `migration.json`
- `api-smoke.json`
- `result.json`

Browser evidence remains under `.artifacts/browser-evidence/<sha>/manifest.json`.

Browser evidence timeout policy:

- `BROWSER_SMOKE_PAYLOAD_TIMEOUT_MS` defaults to `45000` in deploy workflow for scale-to-zero cold starts.

`verify-api-smoke.mjs` behavior:

- Always validates `/health` and auth protection behavior.
- Uses `SMOKE_EXPECTED_ACCOUNT_IDENTITY` for authenticated request path.
- If `SMOKE_REQUIRE_EMPLOYEE_FOUND=true`, requires `200` with payload assertions.
- If unset/`false`, accepts `200` (with payload checks) or `404` (data-independent smoke).
