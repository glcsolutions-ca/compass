# ACA Deploy Runbook

## Purpose

Deploy every commit on `main` to Azure Container Apps using the standard ACR-backed GitHub Actions flow:

- `azure/container-apps-deploy-action` for API and Web
- private ACR images tagged by commit SHA
- managed-identity image pulls (`AcrPull`) at runtime
- migration execution through ACA Job inside the VNet
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
- `ACR_LOGIN_SERVER=<acr-login-server>`
- `ENTRA_ISSUER=<issuer-url>`
- `ENTRA_JWKS_URI=<jwks-url>`
- `ENTRA_AUDIENCE=<api-audience>`
- `SMOKE_EXPECTED_ACCOUNT_IDENTITY=<employee-id>` (optional; default `employee-123`)
- `SMOKE_REQUIRE_EMPLOYEE_FOUND=<true|false>` (optional; default `false`)

## Required GitHub Environment Secrets (`production`)

- `AZURE_DEPLOY_CLIENT_ID`
- `AZURE_SMOKE_CLIENT_ID`

## Registry + Runtime Auth Contract

- Production images are stored in ACR only.
- ACR is provisioned with `adminUserEnabled=false`.
- Deploy workflow authenticates to Azure via OIDC and pushes images to ACR.
- ACA API/Web/Job resources pull images through managed identity (shared user-assigned pull identity).
- `AcrPull` role assignment for the shared pull identity is provisioned by Bicep (`infra/azure/main.bicep`).

## Deploy Sequence

1. Azure OIDC login (deploy identity).
2. API deploy via `azure/container-apps-deploy-action`.
3. Web deploy via `azure/container-apps-deploy-action`.
4. Build/push migration image to ACR.
5. Update and execute ACA migration job (`start-migration-job.mjs`, `wait-migration-job.mjs`).
6. Azure OIDC login (smoke identity), mint Entra access token.
7. API smoke verification (`verify-api-smoke.mjs`) against production URL.
8. Browser evidence against production Web URL.
9. Publish deploy artifacts.

## Artifacts

Artifacts are written under `.artifacts/deploy/<sha>/`:

- `migration-start.json`
- `migration.json`
- `api-smoke.json`
- `result.json`

Browser evidence remains under `.artifacts/browser-evidence/<sha>/manifest.json`.

`verify-api-smoke.mjs` behavior:

- Always validates `/health` and auth protection behavior.
- Uses `SMOKE_EXPECTED_ACCOUNT_IDENTITY` for authenticated request path.
- If `SMOKE_REQUIRE_EMPLOYEE_FOUND=true`, requires `200` with payload assertions.
- If unset/`false`, accepts `200` (with payload checks) or `404` (data-independent smoke).
