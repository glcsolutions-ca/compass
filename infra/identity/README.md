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

## Source Of Truth

- `docs/runbooks/entra-sso-setup.md`
- `.github/workflows/cloud-deployment-pipeline.yml`
