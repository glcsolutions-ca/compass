# Infra

Infrastructure is split into two concerns:

- `platform/infra/azure`: Azure workload infrastructure managed with `Bicep`
- Entra and GitHub control-plane setup: managed by admin scripts in `platform/scripts/bootstrap`

There is no Terraform in the runtime delivery path.

## Production boundary

The active architecture uses one production resource group, but that identifier is not tracked in
the public repo.

Live platform identifiers are stored as private GitHub repository variables and loaded through
[live-config.mjs](/Users/justinkropp/.codex/worktrees/68b7/compass/platform/config/live-config.mjs).

Key Vault, DNS, PostgreSQL, and ACA resources all stay in that resource group because they share the same workload lifecycle.
