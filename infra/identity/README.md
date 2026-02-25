# Identity Infrastructure (Terraform + Entra)

## Scope

- Root module: `infra/identity/main.tf`
- Variables: `infra/identity/variables.tf`
- Outputs: `infra/identity/outputs.tf`
- Environment tfvars: `infra/identity/env/prod.tfvars`
- Pipeline usage:
  - automated acceptance test gate plan: `.github/workflows/cloud-deployment-pipeline.yml` and `.github/workflows/cloud-deployment-pipeline-replay.yml` (`identity-readonly-acceptance`)
  - deployment-stage apply: `.github/workflows/cloud-deployment-pipeline.yml` and `.github/workflows/cloud-deployment-pipeline-replay.yml` (`deploy-identity`)

## What This Manages

1. API app registration + service principal (scopes/roles).
2. Web app registration + service principal.
3. Deploy app registration + service principal.
4. Smoke app registration + service principal.
5. GitHub OIDC federated credentials for workflow identities.
6. App role assignments required for smoke auth checks.

## Backend and Auth

- Terraform backend: Azure Storage (`azurerm` remote state).
- Auth: OIDC + Azure AD (`use_oidc=true`, `use_azuread_auth=true`).
- Automated acceptance test gate and deployment stage use separate client IDs.

## Required Variables

- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `TFSTATE_RESOURCE_GROUP`
- `TFSTATE_STORAGE_ACCOUNT`
- `TFSTATE_CONTAINER`
- `TFSTATE_KEY`
- `API_IDENTIFIER_URI`
- `IDENTITY_OWNER_OBJECT_IDS_JSON`

`API_IDENTIFIER_URI` must use `api://...` format.

## Required Secrets

- `AZURE_IDENTITY_CLIENT_ID` (production apply)
- `AZURE_ACCEPTANCE_IDENTITY_CLIENT_ID` (acceptance plan)

## Bootstrap Notes

Bootstrap is manual once:

1. Create bootstrap app/SP.
2. Add OIDC federation for `acceptance` and `production` environments.
3. Assign Entra `Application Administrator`.
4. Grant tfstate and subscription/RG RBAC needed by Terraform and workflows.
5. Set GitHub identity client ID secrets.
6. Run manual `terraform apply` once to establish managed identity resources.

After that, identity changes converge through the normal pipeline.

## Local Commands

```bash
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
gh_org="${GITHUB_REPOSITORY%%/*}"
gh_repo="${GITHUB_REPOSITORY##*/}"

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
  -var "github_organization=$gh_org" \
  -var "github_repository=$gh_repo" \
  -var "github_environment_name=production" \
  -var "api_identifier_uri=$API_IDENTIFIER_URI" \
  -var "owners=$IDENTITY_OWNER_OBJECT_IDS_JSON"

terraform -chdir=infra/identity apply \
  -auto-approve \
  -var-file=env/prod.tfvars \
  -var "github_organization=$gh_org" \
  -var "github_repository=$gh_repo" \
  -var "github_environment_name=production" \
  -var "api_identifier_uri=$API_IDENTIFIER_URI" \
  -var "owners=$IDENTITY_OWNER_OBJECT_IDS_JSON"
```

## References

- `scripts/pipeline/shared/validate-identity-config.mjs`
- `docs/runbooks/cloud-deployment-pipeline-setup.md`
- `infra/azure/README.md`
