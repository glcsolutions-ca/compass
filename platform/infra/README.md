# Infra

Infrastructure is split into two concerns:

- `platform/infra/azure`: Azure workload infrastructure managed with `Bicep`
- Entra and GitHub control-plane setup: managed by admin scripts in `platform/scripts/bootstrap`

There is no Terraform in the runtime delivery path.

## Production boundary

The active architecture uses one production resource group:

- `rg-compass-prd-cc-001`

Key Vault, DNS, PostgreSQL, and ACA resources all stay in that resource group because they share the same workload lifecycle.
