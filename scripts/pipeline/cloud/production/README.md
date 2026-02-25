# Cloud Production Stage Scripts

## Purpose

`scripts/pipeline/cloud/production/` contains helpers used by production deploy and verification jobs.

## Script Map

- `apply-infra.mjs`: validates/applies Bicep and writes infra artifacts.
- `custom-domain-dns.mjs`: emits DNS records for optional custom-domain cut-in.
- `start-migration-job.mjs`: starts ACA migration job execution.
- `wait-migration-job.mjs`: waits for migration completion and captures status/log metadata.
- `verify-api-smoke.mjs`: validates API health, OpenAPI, allowed/denied auth behavior.
- `record-release.mjs`: records successful deployment in GitHub Deployments.
- `decide-production-stage.mjs`: computes production YES/NO decision artifact.
- `utils.mjs`: shared execution/env/artifact helpers.

## Environment Contract

### Azure runtime context

- `AZURE_RESOURCE_GROUP`
- `ACA_API_APP_NAME`
- `ACA_WEB_APP_NAME`
- `ACA_CODEX_APP_NAME`
- `ACA_MIGRATE_JOB_NAME`
- `ACR_NAME`

### Release context

- `HEAD_SHA`
- `CHANGE_CLASS`
- `TARGET_API_BASE_URL`

### API smoke auth inputs

- `API_IDENTIFIER_URI` (scope defaults to `${API_IDENTIFIER_URI}/.default`)
- `API_SMOKE_ALLOWED_TENANT_ID`
- `API_SMOKE_ALLOWED_CLIENT_ID`
- `API_SMOKE_ALLOWED_CLIENT_SECRET`
- `API_SMOKE_DENIED_TENANT_ID`
- `API_SMOKE_DENIED_CLIENT_ID`
- `API_SMOKE_DENIED_CLIENT_SECRET`

### Deployment record inputs

- `GITHUB_TOKEN`
- `GITHUB_REPOSITORY`
- `TARGET_ENVIRONMENT` (defaults to `production`)

## Artifact Paths

- `.artifacts/production/<sha>/*.json`
- `.artifacts/deploy/<sha>/*.json`
- `.artifacts/infra/<sha>/*`

## Safety

These scripts are on production mutation/verification paths. Keep fail-closed behavior and preserve artifact diagnostics.
