# Cloud Deployment Pipeline Setup

Purpose: configure production cloud deployment prerequisites.

Canonical model: `../development-pipeline.md`.

## Inputs

Required production vars:

- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_RESOURCE_GROUP`
- `AZURE_GITHUB_CLIENT_ID`
- `ACR_NAME`
- `KEY_VAULT_NAME`
- `DYNAMIC_SESSIONS_POOL_NAME`
- `DYNAMIC_SESSIONS_EXECUTOR_IDENTITY_NAME`

Required Key Vault secrets:

- `postgres-admin-password`
- `web-session-secret`
- `entra-client-secret`
- `auth-oidc-state-encryption-key`
- `oauth-token-signing-secret`
- `openai-api-key`

## Steps

1. Bootstrap infrastructure:

```bash
node scripts/infra/bootstrap-cloud-environment.mjs
```

2. Set production GitHub variables:

```bash
gh variable set AZURE_RESOURCE_GROUP -e production --body "$AZURE_RESOURCE_GROUP"
gh variable set AZURE_GITHUB_CLIENT_ID -e production --body "$AZURE_GITHUB_CLIENT_ID"
gh variable set ACR_NAME -e production --body "<acr-name>"
gh variable set KEY_VAULT_NAME -e production --body "<kv-name>"
```

3. Rotate and store Entra secret when needed.
4. Push infra/runtime change to `main`.

## Verify

- release candidate manifest exists
- infra deployment artifact exists
- production smoke artifact exists
- release decision artifact exists

## Failure Handling

- if `main` is red, fix forward or revert
- never bypass failed gates
