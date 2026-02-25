# Azure Infrastructure (Bicep)

## Scope

- Entry point: `infra/azure/main.bicep`
- Environment template: `infra/azure/environments/prod.bicepparam`
- Modules: `infra/azure/modules/*.bicep`
- Pipeline usage:
  - acceptance validate: `.github/workflows/cloud-delivery-pipeline.yml` (`infra-readonly-acceptance`)
  - production apply: `.github/workflows/cloud-delivery-pipeline.yml` and `.github/workflows/cloud-delivery-replay.yml` (`deploy-infra`)

## What This Deploys

1. VNet + ACA/Postgres delegated subnets + private DNS zone/link.
2. Log Analytics + ACA managed environment.
3. ACR.
4. PostgreSQL Flexible Server + database.
5. ACR pull managed identity + `AcrPull` assignment.
6. Container Apps: API, Web, Codex.
7. Manual migration ACA Job.

## Runtime Parameter Contract

Runtime parameters are rendered to `.artifacts/infra/<sha>/runtime.parameters.json` by `scripts/pipeline/shared/render-infra-parameters.mjs`.

### Required Variables

- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_RESOURCE_GROUP`
- `AZURE_LOCATION`
- `AZURE_VNET_NAME`
- `AZURE_ACA_SUBNET_NAME`
- `AZURE_POSTGRES_SUBNET_NAME`
- `AZURE_PRIVATE_DNS_ZONE_NAME`
- `AZURE_LOG_ANALYTICS_WORKSPACE_NAME`
- `ACA_ENVIRONMENT_NAME`
- `ACA_API_APP_NAME`
- `ACA_WEB_APP_NAME`
- `ACA_CODEX_APP_NAME`
- `ACA_MIGRATE_JOB_NAME`
- `ACR_NAME`
- `ACR_PULL_IDENTITY_NAME`
- `POSTGRES_SERVER_NAME`
- `POSTGRES_DATABASE_NAME`
- `POSTGRES_ADMIN_USERNAME`
- `API_IDENTIFIER_URI`
- `AUTH_AUDIENCE`
- `AUTH_ALLOWED_CLIENT_IDS`
- `AUTH_ACTIVE_TENANT_IDS`
- `AUTH_BOOTSTRAP_DELEGATED_USER_OID`
- `AUTH_BOOTSTRAP_DELEGATED_USER_EMAIL`
- `API_SMOKE_ALLOWED_TENANT_ID`
- `OAUTH_TOKEN_ISSUER`
- `OAUTH_TOKEN_AUDIENCE`
- `ACA_API_CUSTOM_DOMAIN` (optional)
- `ACA_WEB_CUSTOM_DOMAIN` (optional)
- `ACA_CODEX_CUSTOM_DOMAIN` (optional)

### Required Secrets

- `AZURE_DEPLOY_CLIENT_ID`
- `POSTGRES_ADMIN_PASSWORD`
- `OAUTH_TOKEN_SIGNING_SECRET`
- `API_SMOKE_ALLOWED_CLIENT_ID`

### Derived Values (not operator inputs)

- `AUTH_ISSUER` is derived from `AZURE_TENANT_ID`.
- `AUTH_JWKS_URI` is derived from `AZURE_TENANT_ID`.
- `ACR_LOGIN_SERVER` is derived from `ACR_NAME`.
- Postgres SKU/version/storage and ACR SKU use IaC defaults in `main.bicep`.

## Custom Domain Model

There is one infra path, no mode flags.

1. Default: leave `ACA_*_CUSTOM_DOMAIN` empty, deploy uses ACA default FQDN.
2. Optional cut-in: set `ACA_API_CUSTOM_DOMAIN`, `ACA_WEB_CUSTOM_DOMAIN`, optional `ACA_CODEX_CUSTOM_DOMAIN`, then run normal pipeline convergence.

## Apply Behavior

1. Validate config contract.
2. Render runtime parameters.
3. Run `az deployment group validate`.
4. Run `az deployment group create`.
5. Capture artifacts under `.artifacts/infra/<sha>/`.

`apply-infra.mjs` retries once for known transient ARM/ACA failures and fails closed otherwise.

## References

- `scripts/pipeline/shared/render-infra-parameters.mjs`
- `scripts/pipeline/shared/validate-infra-acceptance-config.mjs`
- `scripts/pipeline/cloud/production/apply-infra.mjs`
- `docs/runbooks/cloud-deployment-pipeline-setup.md`
