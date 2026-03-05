# Identity Infrastructure

Purpose: Terraform-managed Entra identity and federation wiring.

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
3. The deploy app registration must trust both environment subjects before the rehearsal workflow can log into Azure.
4. GitHub environment vars/secrets must exist for both environments; the OIDC federated credential alone is not enough.

## Derived Redirect URIs

1. Custom domains:
   - `https://<custom_domain>/v1/auth/entra/callback`
2. Blue/green slots:
   - `https://<web_app_name>---blue.<containerapps_env_domain>/v1/auth/entra/callback`
   - `https://<web_app_name>---green.<containerapps_env_domain>/v1/auth/entra/callback`
