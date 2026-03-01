# Cloud Deployment Pipeline Setup

Canonical model: `../development-pipeline.md`.

Use this runbook for production cloud setup, secret management, and environment recreation.

## Required GitHub Production Variables

- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_RESOURCE_GROUP`
- `AZURE_GITHUB_CLIENT_ID`
- `ACR_NAME`
- `KEY_VAULT_NAME`
- `DYNAMIC_SESSIONS_POOL_NAME`
- `DYNAMIC_SESSIONS_EXECUTOR_IDENTITY_NAME`

Recommended runtime flag defaults:

- `AGENT_GATEWAY_ENABLED=false`
- `AGENT_CLOUD_MODE_ENABLED=false`
- `AGENT_LOCAL_MODE_ENABLED_DESKTOP=false`
- `AGENT_MODE_SWITCH_ENABLED=false`

Optional identity convergence runs only when:

- `IDENTITY_CONVERGE_ENABLED=true`
- all required identity backend variables are set

## Required Key Vault Secrets

- `postgres-admin-password`
- `web-session-secret`
- `entra-client-secret`
- `auth-oidc-state-encryption-key`
- `oauth-token-signing-secret`
- `openai-api-key`

## Rotate Entra Secret

```bash
APP_ID="0f3ba6d0-5415-441a-b8af-357699d364d1"
KEY_VAULT_NAME="<kv-name>"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

CLIENT_SECRET="$(az ad app credential reset \
  --id "$APP_ID" \
  --append \
  --display-name "compass-prod-$STAMP" \
  --years 1 \
  --query password -o tsv)"

az keyvault secret set \
  --vault-name "$KEY_VAULT_NAME" \
  --name "entra-client-secret" \
  --value "$CLIENT_SECRET" \
  --output none
```

Credential cleanup and version checks:

```bash
az ad app credential list --id "$APP_ID" -o table
az ad app credential delete --id "$APP_ID" --key-id "<old-key-id>"
az keyvault secret list-versions --vault-name "$KEY_VAULT_NAME" --name "entra-client-secret" -o table
```

## Recreate Environment From Scratch

1. Set local Azure context:

```bash
export AZURE_TENANT_ID="<tenant-id>"
export AZURE_SUBSCRIPTION_ID="<subscription-id>"
export AZURE_RESOURCE_GROUP="<target-rg>"
export AZURE_GITHUB_CLIENT_ID="<deploy-app-client-id>"
```

2. Bootstrap environment (idempotent):

```bash
node scripts/infra/bootstrap-cloud-environment.mjs
```

3. Set production variables in GitHub:

```bash
gh variable set AZURE_RESOURCE_GROUP -e production --body "$AZURE_RESOURCE_GROUP"
gh variable set AZURE_GITHUB_CLIENT_ID -e production --body "$AZURE_GITHUB_CLIENT_ID"
gh variable set ACR_NAME -e production --body "<acr-name-from-cloud.bicepparam>"
gh variable set KEY_VAULT_NAME -e production --body "<kv-name-from-cloud.bicepparam>"
gh variable set IDENTITY_CONVERGE_ENABLED -e production --body "false"
```

4. Push infra-scope commit to `main` and wait for `cloud-deployment-pipeline.yml`.

5. Verify release evidence:

- `.artifacts/release-candidate/<sha>/manifest.json`
- `.artifacts/infra/<sha>/deployment.json`
- `.artifacts/deploy/<sha>/api-smoke.json`
- `.artifacts/release/<sha>/decision.json`

## Failure Policy

- If `main` is red, fix forward or revert immediately.
- Do not bypass failed gates with ad-hoc variable or secret overrides.
