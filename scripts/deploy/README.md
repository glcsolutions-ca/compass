# Deploy Scripts

## Purpose

`scripts/deploy/` contains production release helpers used by `deploy.yml` and `infra-apply.yml`.

## Script Map

| Script                                    | Role                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| `assert-current-main-sha.mjs`             | Stale candidate guard before irreversible mutation boundaries.               |
| `apply-bicep-template.mjs`                | Validates/applies Bicep with transient retry handling and infra artifacts.   |
| `assert-managed-certificate-contract.mjs` | Validates custom-domain/certificate contract before infra apply.             |
| `custom-domain-dns.mjs`                   | Emits required DNS records for managed certificate binding.                  |
| `start-migration-job.mjs`                 | Starts ACA migration job execution and records execution metadata.           |
| `wait-migration-job.mjs`                  | Polls migration execution to terminal state, captures logs/status artifacts. |
| `verify-api-smoke.mjs`                    | Verifies API health/OpenAPI after promotion.                                 |
| `get-last-prod-deployment-sha.mjs`        | Resolves base SHA from successful production deployment record.              |
| `record-production-deployment.mjs`        | Writes successful production deployment record to GitHub Deployments API.    |
| `managed-certificate-contract.mjs`        | Shared contract logic for managed certificate assertions.                    |
| `utils.mjs`                               | Shared execution/env/artifact helpers for deploy scripts.                    |

## Required Env Groups

### Azure Resource Context

- `AZURE_RESOURCE_GROUP`
- `ACA_API_APP_NAME`
- `ACA_WEB_APP_NAME`
- `ACA_MIGRATE_JOB_NAME`
- `ACA_ENVIRONMENT_NAME`
- `ACR_NAME` (for image resolution and registry checks)

### Deploy Metadata

- `HEAD_SHA`
- `RISK_TIER`
- `TESTED_SHA` (where applicable)

### GitHub Deployment Record Context

- `GITHUB_TOKEN`
- `GITHUB_REPOSITORY`
- `TARGET_ENVIRONMENT` (defaults to `production`)

### Optional Flow-Specific Variables

- Migration: `MIGRATION_EXECUTION_NAME`, `MIGRATION_TIMEOUT_SECONDS`
- API smoke: `TARGET_API_BASE_URL`, `VERIFY_SHA_HEADER`, `EXPECTED_SHA`
- Custom domain DNS: `ACA_API_CUSTOM_DOMAIN`, `ACA_WEB_CUSTOM_DOMAIN`

## Artifact Paths

- Deploy lifecycle artifacts: `.artifacts/deploy/<sha>/*.json`
  - `migration-start.json`
  - `migration.json`
  - `api-smoke.json`
- Infra apply helper artifacts: `.artifacts/infra/<sha>/*`
  - `runtime.parameters.json`
  - `deployment.json`
  - `deployment-metadata.json`
  - `deployment-attempts.log`
  - `deployment.stderr.log`
  - `managed-certificate-contract.json`
  - `custom-domain-dns-records.json`

### Change Safety

These scripts sit on production mutation paths. Preserve fail-closed behavior, avoid broad refactors, and keep diagnostic artifacts intact.
