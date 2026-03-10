# Azure Infrastructure

Azure infrastructure is intentionally small.

## Entry points

### `platform/infra/azure/main.bicep`

Creates the long-lived production support platform:

- VNet + subnets
- Postgres private DNS
- Log Analytics
- ACA environment
- Key Vault
- PostgreSQL
- Azure DNS zone for the public web domain

This template does not create the stage/prod apps.

### `platform/infra/azure/apps-bootstrap.bicep`

Admin-only bootstrap template used once to create:

- `api-prod`
- `web-prod`
- `api-stage`
- `web-stage`
- migrate job

After bootstrap, the normal release workflow updates those apps imperatively with `az containerapp update`.

## Live config

Live non-secret but sensitive values do not live in the repo.

The canonical live config source is:

- [live-config.mjs](/Users/justinkropp/.codex/worktrees/68b7/compass/platform/config/live-config.mjs)

Runtime secrets live only in Azure Key Vault.

## Naming

The repo uses CAF-style naming, for example:

- `rg-<workload>-<env>-<region>-<nnn>`
- `cae-<workload>-<env>-<region>-<nnn>`
- `ca-<workload>-api-<env>-<region>-<nnn>`
- `ca-<workload>-web-<env>-<region>-<nnn>`
- `caj-<workload>-migrate-<env>-<region>-<nnn>`
