# Production Bootstrap

Bootstrap is now a single reconciliation path. The public operator commands are:

- `pnpm platform:check`
- `pnpm platform:apply`

## Canonical config model

- live non-secret but sensitive values: GitHub repository variables
- runtime secrets: Azure Key Vault
- GitHub environments: protection, history, and environment URL only
- repo: code, pipeline logic, contracts, and public metadata only

## Required repository variables

```bash
AZURE_DEPLOY_CLIENT_ID
AZURE_TENANT_ID
AZURE_SUBSCRIPTION_ID
AZURE_LOCATION
DEPLOYMENT_STAMP
PRODUCTION_WEB_BASE_URL
AUTH_MODE
ENTRA_WEB_CLIENT_ID
ENTRA_ALLOWED_TENANT_IDS
AZURE_VNET_ADDRESS_PREFIX
AZURE_ACA_SUBNET_PREFIX
AZURE_POSTGRES_SUBNET_PREFIX
```

Everything else is derived from `DEPLOYMENT_STAMP`, `PRODUCTION_WEB_BASE_URL`, and stable defaults in code.

## Required Key Vault secrets

```bash
postgres-admin-password
entra-client-secret
auth-oidc-state-encryption-key
```

## Reconcile the platform

Use the operator path to check then apply:

```bash
pnpm platform:check
pnpm platform:apply -- --candidate-id sha-<main-sha>
```

`pnpm platform:apply` reconciles, in order:

1. Entra app registrations and deploy identity repo vars
2. GitHub rulesets and empty deployment environments
3. Azure infrastructure
4. App bootstrap from the provided candidate
5. Production custom-domain wiring

If the app resources already exist, `pnpm platform:apply` can run without `--candidate-id`. If they do not exist yet, the command fails with a clear instruction to provide one.

After bootstrap, the normal CDP owns all later deployments.

## Notes

- `bootstrap/.artifacts` is local-only and ignored by git.
- `pnpm platform:apply` writes `ENTRA_WEB_CLIENT_ID` and `AZURE_DEPLOY_CLIENT_ID` into GitHub repository variables when needed.
- GitHub environments remain protection-only; they must not hold vars or secrets.
- Runtime secrets belong in Key Vault.
- The delivery pipeline starts with `Commit Stage` in `20-continuous-delivery-pipeline.yml` and promotes the same candidate through Acceptance Stage and Release Stage.
