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
- Azure DNS zone `compass.glcsolutions.ca`

This template does not create the stage/prod apps.

### `platform/infra/azure/apps-bootstrap.bicep`

Admin-only bootstrap template used once to create:

- `api-prod`
- `web-prod`
- `api-stage`
- `web-stage`
- migrate job

After bootstrap, the normal release workflow updates those apps imperatively with `az containerapp update`.

## Parameters

The only environment parameter file is:

- `platform/infra/azure/environments/production.parameters.json`

It contains non-secret values only.

## Naming

The repo uses CAF-style names:

- `rg-compass-prd-cc-001`
- `cae-compass-prd-cc-001`
- `ca-compass-api-prd-cc-001`
- `ca-compass-web-prd-cc-001`
- `ca-compass-api-stg-prd-cc-001`
- `ca-compass-web-stg-prd-cc-001`
- `caj-compass-migrate-prd-cc-001`
