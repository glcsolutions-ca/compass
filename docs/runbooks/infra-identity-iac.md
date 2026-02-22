# Infra + Identity IaC Runbook

## Scope

This repository uses split control-plane IaC:

- Azure resources (network, ACA, Postgres): `infra/azure/**` (Bicep)
- Entra identities and app registrations: `infra/identity/**` (Terraform `azuread`)

Both paths are versioned and reviewed in PRs.

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

## Bootstrap Trust Anchor (One-Time Manual)

Bootstrap is manual once. After bootstrap, identity/infra/deploy runs through workflows.

Required operator permissions:

- Entra role admin capability (to assign `Application Administrator`)
- Azure RBAC to create storage and role assignments for tfstate
- GitHub repo admin to write `production` environment vars/secrets

Bootstrap steps:

1. Create bootstrap app + service principal (`compass-identity-bootstrap-prod`).
2. Add federated credential subject:
   - `repo:<org>/<repo>:environment:production`
3. Assign `Application Administrator` to bootstrap SP.
4. Create tfstate storage and grant bootstrap SP `Storage Blob Data Contributor`.
5. Set GitHub environment secret `AZURE_IDENTITY_CLIENT_ID`.

### Bootstrap Identity Rotation

1. Create a new bootstrap app/SP.
2. Add the same federated credential subject.
3. Grant the same Entra/Azure roles.
4. Update `production` secret `AZURE_IDENTITY_CLIENT_ID`.
5. Run `identity-plan` to verify auth.
6. Remove old role assignments/app when replacement is verified.

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
- `ACR_PULL_IDENTITY_NAME`
- `ACR_NAME`
- `ACR_SKU`
- `POSTGRES_SERVER_NAME`
- `POSTGRES_DATABASE_NAME`
- `POSTGRES_ADMIN_USERNAME`
- `POSTGRES_VERSION`
- `POSTGRES_SKU_NAME`
- `POSTGRES_SKU_TIER`
- `POSTGRES_STORAGE_MB`
- `ENTRA_ISSUER`
- `ENTRA_AUDIENCE`
- `ENTRA_JWKS_URI`

Required GitHub environment secrets for infra apply:

- `AZURE_DEPLOY_CLIENT_ID`
- `POSTGRES_ADMIN_PASSWORD`

ACA managed environment profile policy:

- `infra/azure/modules/containerapps-env.bicep` must declare the `Consumption` workload profile explicitly.
- This avoids update-time `WorkloadProfileCannotRemoveAll` failures when the environment already exists.

Provider registration preflight (enforced in `.github/workflows/infra-apply.yml`):

- `Microsoft.App`
- `Microsoft.ContainerService`
- `Microsoft.Network`
- `Microsoft.DBforPostgreSQL`
- `Microsoft.OperationalInsights`

Registry policy:

- ACR is the only production container registry for ACA.
- ACR is provisioned in Bicep with `adminUserEnabled=false`.
- API/Web/Job resources use a shared user-assigned managed identity for image pulls.
- `AcrPull` role assignment is applied at ACR scope for the shared pull identity.
- `infra-apply` explicitly checks/enables ACR `authentication-as-arm`.
- `infra-apply` derives the ACR login server from `ACR_NAME` and resolves image references from current deployed image or `image_tag` override.
- `image_tag` override applies to API/Web images only.
- Migration job image is pinned to the API image (single-image release artifact pattern).
- ACR storage lifecycle is controlled by `.github/workflows/acr-cleanup.yml` (scheduled/manual tag pruning, keep newest 15 tags by default).

Database policy:

- Production `DATABASE_URL` is derived in Bicep from:
  - `POSTGRES_SERVER_NAME`
  - `POSTGRES_DATABASE_NAME`
  - `POSTGRES_ADMIN_USERNAME`
  - `POSTGRES_ADMIN_PASSWORD`
- Host is canonical Azure Flexible Server FQDN form:
  - `<POSTGRES_SERVER_NAME>.postgres.database.azure.com`
- Private DNS zone input is fail-closed in `infra-apply`: must use the Azure PostgreSQL private DNS suffix format.
- Cost-first default sizing is supported with:
  - `POSTGRES_SKU_TIER=Burstable`
  - `POSTGRES_SKU_NAME=Standard_B1ms`
- Burstable pairing is fail-closed in `infra-apply`: `POSTGRES_SKU_NAME` must begin with `Standard_B`.
- Burstable is only appropriate for mostly-idle workloads. If CPU credits deplete under sustained load, move to `GeneralPurpose` and monitor `CPU Credits Remaining`.

## Entra Identity (Terraform)

- Stack path: `infra/identity/`
- Variables template: `infra/identity/env/prod.tfvars`
- Plan workflow: `.github/workflows/identity-plan.yml`
- Apply workflow: `.github/workflows/identity-apply.yml`
- GitHub environment source: `production`
- Backend: remote `azurerm` (OIDC + Azure AD auth)

Required GitHub environment variables for identity workflows:

- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `GH_ORGANIZATION`
- `GH_REPOSITORY_NAME`
- `ENTRA_AUDIENCE`
- `IDENTITY_OWNER_OBJECT_IDS_JSON` (JSON array of owner object IDs)
- `TFSTATE_RESOURCE_GROUP`
- `TFSTATE_STORAGE_ACCOUNT`
- `TFSTATE_CONTAINER`
- `TFSTATE_KEY`

Required GitHub environment secrets for identity workflows:

- `AZURE_IDENTITY_CLIENT_ID`

### Identity Workflow Evidence

`identity-plan` artifact:

- `.artifacts/identity/<sha>/plan.json`

`identity-apply` artifact:

- `.artifacts/identity/<sha>/outputs.json`

Expected outputs consumed downstream:

- `deploy_application_client_id`
- `smoke_application_client_id`
- `entra_issuer`
- `entra_jwks_uri`
- `entra_audience`

Map these outputs into GitHub `production` vars/secrets before production deploy.

## Local Identity Commands (Optional)

```bash
terraform -chdir=infra/identity init \
  -backend-config="resource_group_name=$TFSTATE_RESOURCE_GROUP" \
  -backend-config="storage_account_name=$TFSTATE_STORAGE_ACCOUNT" \
  -backend-config="container_name=$TFSTATE_CONTAINER" \
  -backend-config="key=$TFSTATE_KEY" \
  -backend-config="use_oidc=true" \
  -backend-config="use_azuread_auth=true" \
  -backend-config="tenant_id=$AZURE_TENANT_ID" \
  -backend-config="subscription_id=$AZURE_SUBSCRIPTION_ID" \
  -backend-config="client_id=$AZURE_IDENTITY_CLIENT_ID"

terraform -chdir=infra/identity plan \
  -var-file=env/prod.tfvars \
  -var "github_organization=$GH_ORGANIZATION" \
  -var "github_repository=$GH_REPOSITORY_NAME" \
  -var "github_environment_name=production" \
  -var "api_identifier_uri=$ENTRA_AUDIENCE" \
  -var "owners=$IDENTITY_OWNER_OBJECT_IDS_JSON"

terraform -chdir=infra/identity apply \
  -var-file=env/prod.tfvars \
  -var "github_organization=$GH_ORGANIZATION" \
  -var "github_repository=$GH_REPOSITORY_NAME" \
  -var "github_environment_name=production" \
  -var "api_identifier_uri=$ENTRA_AUDIENCE" \
  -var "owners=$IDENTITY_OWNER_OBJECT_IDS_JSON"
```
