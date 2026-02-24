# Cloud Production Stage Scripts

## Purpose

`scripts/pipeline/cloud/production/` contains production stage helpers used by `cloud-deployment-pipeline.yml`.

## Script Map

| Script                                    | Role                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| `apply-infra.mjs`                         | Validates/applies Bicep with transient retry handling and infra artifacts.   |
| `assert-managed-certificate-contract.mjs` | Validates custom-domain/certificate contract before infra apply.             |
| `custom-domain-dns.mjs`                   | Emits required DNS records for managed certificate binding.                  |
| `start-migration-job.mjs`                 | Starts ACA migration job execution and records metadata.                     |
| `wait-migration-job.mjs`                  | Polls migration execution to terminal state, captures logs/status artifacts. |
| `verify-api-smoke.mjs`                    | Verifies API health/OpenAPI after promotion.                                 |
| `record-release.mjs`                      | Writes successful production deployment record to GitHub Deployments API.    |
| `decide-production-stage.mjs`             | Produces production stage YES/NO result artifact and reason codes.           |
| `managed-certificate-contract.mjs`        | Shared contract logic for managed certificate assertions.                    |
| `utils.mjs`                               | Shared execution/env/artifact helpers for production scripts.                |

## Required Env Groups

### Azure Resource Context

- `AZURE_RESOURCE_GROUP`
- `ACA_API_APP_NAME`
- `ACA_WEB_APP_NAME`
- `ACA_MIGRATE_JOB_NAME`
- `ACA_ENVIRONMENT_NAME`
- `ACR_NAME`

### Production Metadata

- `HEAD_SHA`
- `CHANGE_CLASS`

### GitHub Deployment Record Context

- `GITHUB_TOKEN`
- `GITHUB_REPOSITORY`
- `TARGET_ENVIRONMENT` (defaults to `production`)

## Artifact Paths

- Production lifecycle artifacts: `.artifacts/production/<sha>/*.json`
- Deploy lifecycle artifacts: `.artifacts/deploy/<sha>/*.json`
- Infra apply helper artifacts: `.artifacts/infra/<sha>/*`

## Change Safety

These scripts sit on production mutation paths. Preserve fail-closed behavior, avoid broad refactors, and keep diagnostic artifacts intact.
