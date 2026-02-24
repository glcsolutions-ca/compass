# Identity Infrastructure (Terraform + Entra)

## Scope and Entry Points

- Terraform root module: `infra/identity/main.tf`
- Variable contract: `infra/identity/variables.tf`
- Output contract: `infra/identity/outputs.tf`
- Provider + caller identity data: `infra/identity/providers.tf`
- Terraform + provider versions/backend declaration: `infra/identity/versions.tf`
- Environment variable template: `infra/identity/env/prod.tfvars`
- Pipeline stages:
  - `.github/workflows/deployment-pipeline.yml` (`identity-readonly-acceptance`, plan)
  - `.github/workflows/deployment-pipeline.yml` (`deploy-approved-candidate`, apply)

## Provisioned Identity Objects

`main.tf` provisions these Entra resources:

| Object                                                            | Purpose                                                                          |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `azuread_application.api` + `azuread_service_principal.api`       | Compass API app registration, delegated scope, and `TimeSync.Admin` app role.    |
| `azuread_application.web` + `azuread_service_principal.web`       | Compass Web app registration with redirect URI and required API delegated scope. |
| `azuread_application.deploy` + `azuread_service_principal.deploy` | Deploy identity used by production workflows via OIDC federation.                |
| `azuread_application.smoke` + `azuread_service_principal.smoke`   | Smoke identity granted API application role access.                              |
| `azuread_application_federated_identity_credential.deploy_main`   | GitHub Actions OIDC trust for deploy identity (`environment: production`).       |
| `azuread_application_federated_identity_credential.smoke_main`    | GitHub Actions OIDC trust for smoke identity (`environment: production`).        |
| `azuread_app_role_assignment.smoke_timesync_admin`                | Binds smoke service principal to API `TimeSync.Admin` role.                      |

## Backend and Auth Model

- Backend is `azurerm` (remote state in Azure Storage).
- Authentication model is OIDC + Azure AD auth (`use_oidc=true`, `use_azuread_auth=true`).
- Mainline acceptance stage runs non-mutating Terraform plan evidence.
- Mainline production stage runs guarded Terraform apply for accepted candidates.

## Acceptance vs Production Credential Boundary

- Acceptance identity plan uses read-only identity credentials in `acceptance` environment.
- Production identity apply uses mutating credentials in `production` environment.
- Mainline pipeline enforces this split with `AZURE_ACCEPTANCE_IDENTITY_CLIENT_ID` for acceptance and `AZURE_IDENTITY_CLIENT_ID` for production.

## Required Production Variables (identity acceptance/apply)

- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `GH_ORGANIZATION`
- `GH_REPOSITORY_NAME`
- `API_IDENTIFIER_URI` (canonical)
- `ENTRA_AUDIENCE` (legacy fallback during transition)
- `IDENTITY_OWNER_OBJECT_IDS_JSON`
- `TFSTATE_RESOURCE_GROUP`
- `TFSTATE_STORAGE_ACCOUNT`
- `TFSTATE_CONTAINER`
- `TFSTATE_KEY`

`API_IDENTIFIER_URI` must use `api://...` format. If both `API_IDENTIFIER_URI` and `ENTRA_AUDIENCE` are set, they must be identical.

## Required Production Secrets (identity acceptance/apply)

- `AZURE_IDENTITY_CLIENT_ID` (required for production identity apply)
- `AZURE_ACCEPTANCE_IDENTITY_CLIENT_ID` (optional but recommended for acceptance read-only identity plan)

## Bootstrap Trust Anchor (One-Time Manual)

Bootstrap is manual once, then stage workflows own repeatable convergence.

Required operator permissions:

- Entra role administration capability (to assign `Application Administrator`)
- Azure RBAC to create/grant Terraform state storage access
- GitHub repository admin access for `production` environment vars/secrets

Bootstrap steps:

1. Create bootstrap app registration and service principal (example naming: `compass-identity-bootstrap-prod`).
2. Add federated credential subject: `repo:<org>/<repo>:environment:production`.
3. Assign `Application Administrator` to the bootstrap service principal.
4. Create/prepare Terraform state storage and grant `Storage Blob Data Contributor` on the tfstate container scope.
5. Set GitHub `production` secret `AZURE_IDENTITY_CLIENT_ID` to the bootstrap app client ID.
6. Run deployment pipeline with identity scope to confirm non-mutating auth and backend access.

## Bootstrap Identity Rotation

Rotate bootstrap identity with explicit handoff:

1. Create a new bootstrap app registration/service principal.
2. Add the same federated credential subject (`repo:<org>/<repo>:environment:production`).
3. Grant the same Entra role assignments and Azure RBAC access used by the previous bootstrap identity.
4. Update GitHub `production` secret `AZURE_IDENTITY_CLIENT_ID` to the new client ID.
5. Run deployment pipeline (identity scope) to verify auth and backend access.
6. Remove old role assignments and old bootstrap app after replacement is verified.

## Workflow Evidence

- Mainline acceptance stage writes `.artifacts/identity/<sha>/plan.json`.
- Mainline acceptance stage writes config-contract results to `.artifacts/identity/<sha>/config-validation.json`.
- Mainline production stage writes `.artifacts/identity/<sha>/outputs.json`.

## Outputs Contract and Downstream Mapping

Terraform outputs from `outputs.tf`:

- `tenant_id`
- `entra_issuer`
- `entra_jwks_uri`
- `entra_audience`
- `api_application_client_id`
- `web_application_client_id`
- `deploy_application_client_id`
- `smoke_application_client_id`
- `timesync_admin_role_id`

Expected production mapping:

- `deploy_application_client_id` -> GitHub `production` secret `AZURE_DEPLOY_CLIENT_ID`
- `entra_audience` -> GitHub `production` variable `API_IDENTIFIER_URI` (canonical)
- `entra_audience` -> GitHub `production` variable `ENTRA_AUDIENCE` (legacy transition only)
- `entra_issuer` and `entra_jwks_uri` -> tracked in production environment config contract for token validation consumers
- `smoke_application_client_id` -> tracked in production environment config contract for smoke identity consumers

## Local Terraform Commands

Use these commands when validating identity changes locally with the same backend/auth model as CI:

```bash
API_IDENTIFIER_URI="${API_IDENTIFIER_URI:-$ENTRA_AUDIENCE}"

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
  -var "api_identifier_uri=$API_IDENTIFIER_URI" \
  -var "owners=$IDENTITY_OWNER_OBJECT_IDS_JSON"

terraform -chdir=infra/identity apply \
  -var-file=env/prod.tfvars \
  -var "github_organization=$GH_ORGANIZATION" \
  -var "github_repository=$GH_REPOSITORY_NAME" \
  -var "github_environment_name=production" \
  -var "api_identifier_uri=$API_IDENTIFIER_URI" \
  -var "owners=$IDENTITY_OWNER_OBJECT_IDS_JSON"
```

## References

- `.github/workflows/deployment-pipeline.yml`
- `infra/README.md`
- `infra/azure/README.md`
- `docs/runbooks/production-stage.md`
