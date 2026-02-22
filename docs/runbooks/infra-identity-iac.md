# Infra + Identity IaC Runbook

## Scope

This repository uses split control-plane IaC:

- Azure resources (network, ACA, Postgres): `infra/azure/**` (Bicep)
- Entra identities and app registrations: `infra/identity/**` (Terraform `azuread`)

Both are versioned and reviewed in PRs.

## Non-Commit Policy (Required)

Do not commit organization-specific infra values to tracked files. This includes:

- tenant IDs and subscription IDs
- resource group and app/job names
- private DNS zone names
- server FQDNs and concrete DB hostnames
- concrete Entra issuer/JWKS tenant URLs
- organization-specific GitHub slugs used for production identity/deploy wiring

Concrete values must be stored only in GitHub Environment configuration (`production` vars/secrets).

CI enforces this via `scripts/ci/no-org-infra-leak.mjs` in `.github/workflows/merge-contract.yml`.

## Azure Infra (Bicep)

- Entry point: `infra/azure/main.bicep`
- Environment params template: `infra/azure/environments/prod.bicepparam`
- Workflow: `.github/workflows/infra-apply.yml`
- Naming convention target: Azure CAF (`type-workload-env-region-instance`)
- GitHub environment source: `production`

Required GitHub environment variables for infra apply:

- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_RESOURCE_GROUP`
- `AZURE_LOCATION`
- `AZURE_VNET_NAME`
- `AZURE_ACA_SUBNET_NAME`
- `AZURE_POSTGRES_SUBNET_NAME`
- `AZURE_PRIVATE_DNS_ZONE_NAME`
- `ACA_ENVIRONMENT_NAME`
- `AZURE_LOG_ANALYTICS_WORKSPACE_NAME`
- `ACA_API_APP_NAME`
- `ACA_WEB_APP_NAME`
- `ACA_MIGRATE_JOB_NAME`
- `POSTGRES_SERVER_NAME`
- `POSTGRES_DATABASE_NAME`
- `POSTGRES_ADMIN_USERNAME`
- `POSTGRES_VERSION`
- `POSTGRES_SKU_NAME`
- `POSTGRES_STORAGE_MB`
- `GHCR_SERVER`
- `ACA_API_IMAGE`
- `ACA_WEB_IMAGE`
- `ACA_MIGRATE_IMAGE`
- `ENTRA_ISSUER`
- `ENTRA_AUDIENCE`
- `ENTRA_JWKS_URI`

Required GitHub environment secrets for infra apply:

- `AZURE_DEPLOY_CLIENT_ID`
- `GHCR_USERNAME`
- `GHCR_PASSWORD`
- `POSTGRES_ADMIN_PASSWORD`
- `DATABASE_URL`
- `WEB_BEARER_TOKEN` (optional)

Apply manually:

```bash
az bicep build-params \
  --file infra/azure/environments/prod.bicepparam \
  --outfile /tmp/prod.parameters.json

az deployment group create \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --template-file infra/azure/main.bicep \
  --parameters @/tmp/prod.parameters.json \
  --parameters location="$AZURE_LOCATION" \
  --parameters vnetName="$AZURE_VNET_NAME" \
  --parameters acaSubnetName="$AZURE_ACA_SUBNET_NAME" \
  --parameters postgresSubnetName="$AZURE_POSTGRES_SUBNET_NAME" \
  --parameters privateDnsZoneName="$AZURE_PRIVATE_DNS_ZONE_NAME" \
  --parameters environmentName="$ACA_ENVIRONMENT_NAME" \
  --parameters logAnalyticsWorkspaceName="$AZURE_LOG_ANALYTICS_WORKSPACE_NAME" \
  --parameters apiAppName="$ACA_API_APP_NAME" \
  --parameters webAppName="$ACA_WEB_APP_NAME" \
  --parameters migrationJobName="$ACA_MIGRATE_JOB_NAME" \
  --parameters postgresServerName="$POSTGRES_SERVER_NAME" \
  --parameters postgresDatabaseName="$POSTGRES_DATABASE_NAME" \
  --parameters postgresAdminUsername="$POSTGRES_ADMIN_USERNAME" \
  --parameters postgresVersion="$POSTGRES_VERSION" \
  --parameters postgresSkuName="$POSTGRES_SKU_NAME" \
  --parameters postgresStorageMb="$POSTGRES_STORAGE_MB" \
  --parameters ghcrServer="$GHCR_SERVER" \
  --parameters ghcrUsername="$GHCR_USERNAME" \
  --parameters ghcrPassword="$GHCR_PASSWORD" \
  --parameters postgresAdminPassword="$POSTGRES_ADMIN_PASSWORD" \
  --parameters databaseUrl="$DATABASE_URL" \
  --parameters apiImage="$ACA_API_IMAGE" \
  --parameters webImage="$ACA_WEB_IMAGE" \
  --parameters migrateImage="$ACA_MIGRATE_IMAGE" \
  --parameters entraIssuer="$ENTRA_ISSUER" \
  --parameters entraAudience="$ENTRA_AUDIENCE" \
  --parameters entraJwksUri="$ENTRA_JWKS_URI"
```

## Entra Identity (Terraform)

- Stack path: `infra/identity/`
- Variables template: `infra/identity/env/prod.tfvars`
- Plan workflow: `.github/workflows/identity-plan.yml`
- Apply workflow: `.github/workflows/identity-apply.yml`
- GitHub environment source: `production`

Required GitHub environment variables for identity workflows:

- `GH_ORGANIZATION`
- `GH_REPOSITORY_NAME`
- `GH_MAIN_BRANCH_REF`
- `ENTRA_AUDIENCE`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

Required GitHub environment secrets for identity workflows:

- `AZURE_IDENTITY_CLIENT_ID`

Local plan/apply (with environment variables):

```bash
terraform -chdir=infra/identity init
terraform -chdir=infra/identity plan \
  -var-file=env/prod.tfvars \
  -var "github_organization=$GH_ORGANIZATION" \
  -var "github_repository=$GH_REPOSITORY_NAME" \
  -var "github_main_branch_ref=$GH_MAIN_BRANCH_REF" \
  -var "api_identifier_uri=$ENTRA_AUDIENCE"
terraform -chdir=infra/identity apply \
  -var-file=env/prod.tfvars \
  -var "github_organization=$GH_ORGANIZATION" \
  -var "github_repository=$GH_REPOSITORY_NAME" \
  -var "github_main_branch_ref=$GH_MAIN_BRANCH_REF" \
  -var "api_identifier_uri=$ENTRA_AUDIENCE"
```

## Identity Outputs Used By API/Deploy

- `entra_issuer`
- `entra_jwks_uri`
- `entra_audience`
- deploy/smoke application client IDs

Map these outputs to GitHub environment `production` variables/secrets before enabling production deploys.
