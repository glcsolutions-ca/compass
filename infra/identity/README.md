# Identity Infrastructure

Purpose: Terraform-managed Entra identity and federation wiring.

Current production identity model:

1. `compass-deploy-prod` is the canonical GitHub Actions deploy principal for production.
2. GitHub environments `production` and `production-rehearsal` must both use that principal via `AZURE_DEPLOY_CLIENT_ID`.
3. The bootstrap app is not the production release workflow identity.

## Start Here

- terraform root: `infra/identity`
- env vars and tfstate settings from production environment configuration

## Run

```bash
terraform -chdir=infra/identity init
terraform -chdir=infra/identity plan
terraform -chdir=infra/identity apply
```

## Redirect URI Inputs

1. `web_custom_domains` defines production/custom-domain callback hosts.
2. `web_custom_domain` is still accepted for backward compatibility (legacy single-domain input).
3. `web_containerapp_fqdn` with `release_slot_labels = ["blue","green"]` adds blue/green slot callback URIs for release smoke checks.
4. `github_environment_name` plus `github_additional_environment_names` define which GitHub environments can use the deploy app's OIDC federation.

Terraform merges all callback URIs with `web_redirect_uris` and removes duplicates via `distinct(...)`.

## GitHub OIDC Federation

1. `production` remains the manual approval environment for promotion.
2. `production-rehearsal` is a second federated environment for the 0%-traffic rehearsal workflow.
3. `compass-deploy-prod` must trust both environment subjects before the rehearsal workflow can log into Azure.
4. GitHub environment secret `AZURE_DEPLOY_CLIENT_ID` must equal Terraform output `deploy_application_client_id` for both environments.
5. GitHub environment vars/secrets must exist for both environments; the OIDC federated credential alone is not enough.

## Bootstrap Boundary

1. [bootstrap-cloud-environment.mjs](/Users/justinkropp/.codex/worktrees/2bfd/compass/scripts/infra/bootstrap-cloud-environment.mjs) now prefers `AZURE_DEPLOY_CLIENT_ID`.
2. `AZURE_GITHUB_CLIENT_ID` remains a deprecated fallback for older bootstrap invocations.
3. Bootstrap/manual infra operations may still use the bootstrap app, but production release workflows must not.

## Legacy Identities

1. `compass-smoke-prod` is not used by the current release workflows.
2. Keep it only until an external-consumer audit confirms it can be removed safely.

## Audit Commands

```bash
terraform -chdir=infra/identity output -raw deploy_application_client_id
az ad app federated-credential list --id "$(terraform -chdir=infra/identity output -raw deploy_application_client_id)"
az ad sp show --id "$(terraform -chdir=infra/identity output -raw deploy_application_client_id)" --query id -o tsv
az role assignment list \
  --assignee-object-id "$(az ad sp show --id "$(terraform -chdir=infra/identity output -raw deploy_application_client_id)" --query id -o tsv)" \
  --scope "/subscriptions/<subscription-id>/resourceGroups/<resource-group>"
```

## Derived Redirect URIs

1. Custom domains:
   - `https://<custom_domain>/v1/auth/entra/callback`
2. Blue/green slots:
   - `https://<web_app_name>---blue.<containerapps_env_domain>/v1/auth/entra/callback`
   - `https://<web_app_name>---green.<containerapps_env_domain>/v1/auth/entra/callback`
