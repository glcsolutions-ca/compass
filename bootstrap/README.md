# Production Bootstrap

Bootstrap is a one-time admin runbook. Its job is to stage production once, then hand off to the normal delivery pipeline.

## Phase A: Stage production

```bash
az login
az account set --subscription 4514a0d0-2cdc-468e-be25-895aef2846ad
az group create --name rg-compass-prd-cc-001 --location canadacentral

pnpm bootstrap:entra -- --reset-web-client-secret
pnpm bootstrap:github:apply
```

In GitHub, set the `compass-api` and `compass-web` container packages to `public`.

```bash
export POSTGRES_ADMIN_PASSWORD='replace-with-a-strong-random-password'
pnpm infra:apply
unset POSTGRES_ADMIN_PASSWORD
```

`pnpm infra:apply` creates the Azure foundation and writes `postgres-admin-password` into Key Vault during that same deployment.

Set the remaining runtime secrets directly in Key Vault:

```bash
az keyvault secret set \
  --vault-name kv-compass-prd-cc-001 \
  --name entra-client-secret \
  --value '<web-client-secret>'

az keyvault secret set \
  --vault-name kv-compass-prd-cc-001 \
  --name auth-oidc-state-encryption-key \
  --value '<strong-random-secret>'
```

Verify the database admin secret exists:

```bash
az keyvault secret show \
  --vault-name kv-compass-prd-cc-001 \
  --name postgres-admin-password \
  --query id \
  -o tsv
```

## Phase B: Create the initial app resources once

1. Push directly to `main` or merge one change to `main` so `Continuous Delivery Pipeline` publishes a candidate to GHCR.
2. Run:

```bash
pnpm bootstrap:apps -- --candidate-id sha-<main-sha>
```

After that, the normal pipeline owns deploys and updates.

## Optional follow-up tasks

- If you need the stage web callback URL in Entra, rerun:

```bash
pnpm bootstrap:entra -- --stage-web-fqdn <fqdn>
```

- If you want to bind the production custom domain, run:

```bash
node platform/scripts/bootstrap/configure-web-domain.mjs
```

## Notes

- `bootstrap/.artifacts` is local-only and ignored by git.
- `pnpm bootstrap:github:apply` configures GitHub deployment wiring only. Runtime secrets belong in Key Vault.
- The delivery pipeline starts with `Commit Stage` in `20-continuous-delivery-pipeline.yml` and promotes the same candidate through Acceptance Stage and Release Stage.
