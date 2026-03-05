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

## Blue/Green Redirect URIs

To support production blue/green SSO smoke checks, set `web_containerapp_fqdn` and keep default `release_slot_labels = ["blue","green"]`.

Terraform derives these callback URIs automatically:

1. `https://<web_app_name>---blue.<containerapps_env_domain>/v1/auth/entra/callback`
2. `https://<web_app_name>---green.<containerapps_env_domain>/v1/auth/entra/callback`

These are merged with existing redirect URIs (`web_redirect_uris` and custom-domain callback).
