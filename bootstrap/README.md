# Production Bootstrap

Bootstrap is a one-time admin runbook. Its job is to stage production once, then hand off to the normal delivery pipeline.

## Canonical config model

- live non-secret but sensitive values: GitHub repository variables
- runtime secrets: Azure Key Vault
- GitHub environments: protection, history, and environment URL only
- repo: code, pipeline logic, contracts, and public metadata only

Before bootstrapping, seed the canonical repo variables in GitHub. `pnpm bootstrap:github:check`
fails until they exist.

## Phase A: Stage production

```bash
az login
export AZURE_SUBSCRIPTION_ID="$(gh variable get AZURE_SUBSCRIPTION_ID --repo glcsolutions-ca/compass)"
export AZURE_RESOURCE_GROUP="$(gh variable get AZURE_RESOURCE_GROUP --repo glcsolutions-ca/compass)"
export AZURE_LOCATION="$(gh variable get AZURE_LOCATION --repo glcsolutions-ca/compass)"

az account set --subscription "$AZURE_SUBSCRIPTION_ID"
az group create --name "$AZURE_RESOURCE_GROUP" --location "$AZURE_LOCATION"

pnpm bootstrap:entra -- --reset-web-client-secret
pnpm bootstrap:github:apply

unset AZURE_SUBSCRIPTION_ID AZURE_RESOURCE_GROUP AZURE_LOCATION
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
export AZURE_KEY_VAULT_NAME="$(gh variable get AZURE_KEY_VAULT_NAME --repo glcsolutions-ca/compass)"

az keyvault secret set \
  --vault-name "$AZURE_KEY_VAULT_NAME" \
  --name entra-client-secret \
  --value '<web-client-secret>'

az keyvault secret set \
  --vault-name "$AZURE_KEY_VAULT_NAME" \
  --name auth-oidc-state-encryption-key \
  --value '<strong-random-secret>'

unset AZURE_KEY_VAULT_NAME
```

Verify the database admin secret exists:

```bash
export AZURE_KEY_VAULT_NAME="$(gh variable get AZURE_KEY_VAULT_NAME --repo glcsolutions-ca/compass)"

az keyvault secret show \
  --vault-name "$AZURE_KEY_VAULT_NAME" \
  --name postgres-admin-password \
  --query id \
  -o tsv

unset AZURE_KEY_VAULT_NAME
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
- `pnpm bootstrap:entra` writes `ENTRA_WEB_CLIENT_ID` and `AZURE_DEPLOY_CLIENT_ID` into GitHub repository variables.
- `pnpm bootstrap:github:apply` configures labels, rulesets, and deployment environments, and removes any environment-scoped vars/secrets so GitHub environments remain protection-only.
- Runtime secrets belong in Key Vault.
- The delivery pipeline starts with `Commit Stage` in `20-continuous-delivery-pipeline.yml` and promotes the same candidate through Acceptance Stage and Release Stage.
