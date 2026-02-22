# ACA Deploy Runbook

## Purpose

Deploy every commit on `main` as a release candidate to Azure Container Apps using:

- GHCR images tagged by commit SHA
- candidate revisions at 0% production traffic
- migration job execution inside the ACA VNet
- machine-verifiable smoke/evidence artifacts
- automatic promotion and rollback handling

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
- `GHCR_USERNAME=<github-user-login-that-owns-the-PAT>`
- `ENTRA_ISSUER=<issuer-url>`
- `ENTRA_JWKS_URI=<jwks-url>`
- `ENTRA_AUDIENCE=<api-audience>`
- `SMOKE_EXPECTED_ACCOUNT_IDENTITY=<employee-id>` (optional; default `employee-123`)

## Required GitHub Environment Secrets (`production`)

- `AZURE_DEPLOY_CLIENT_ID`
- `AZURE_SMOKE_CLIENT_ID`
- `GHCR_PASSWORD` (PAT with `read:packages` for the same GitHub user in `GHCR_USERNAME`)
- `DATABASE_URL`
- `POSTGRES_ADMIN_PASSWORD`
- `WEB_BEARER_TOKEN` (optional)

## GHCR Pull Policy

- GHCR images are private in production.
- ACA resources declare registry credentials explicitly via `configuration.registries` (`server`, `username`, `passwordSecretRef`).
- `GHCR_USERNAME` and `GHCR_PASSWORD` must be for the same GitHub account.
- Use a dedicated machine-user PAT for production pulls; do not use a personal developer token.
- If your org enforces SAML SSO, authorize the PAT for the org before rollout.
- GHCR PAT is injected as a secret and referenced through `passwordSecretRef` in Bicep.
- `infra-apply` resolves API/Web/migrate images from the current commit SHA and waits until those tags are available in GHCR.

## Gate Sequence

1. Gate 0: head SHA guard (`scripts/deploy/head-sha-guard.mjs`)
2. Gate 1: build/push API/Web/migrate images to GHCR (`:<sha>`)
3. Gate 2: deploy candidate revisions (`scripts/deploy/candidate-deploy.mjs`)
4. Gate 3: run migration ACA Job (`start-migration-job.mjs`, `wait-migration-job.mjs`)
5. Gate 4: smoke + browser evidence against candidate URLs
6. Gate 5: re-check head SHA and promote traffic (`promote-traffic.mjs`)
7. Gate 5.5: post-deploy smoke on production URL
8. Gate 5.6: rollback on post-promotion failure (`rollback-traffic.mjs`)
9. Gate 6: final result artifact (`write-deploy-artifact.mjs`)

## Artifacts

Artifacts are written under `.artifacts/deploy/<sha>/`:

- `candidate-manifest.json`
- `candidate-deploy.json`
- `migration-start.json`
- `migration.json`
- `api-smoke.json`
- `promotion.json`
- `rollback.json` (conditional)
- `result.json`

Browser evidence remains under `.artifacts/browser-evidence/<sha>/manifest.json`.
