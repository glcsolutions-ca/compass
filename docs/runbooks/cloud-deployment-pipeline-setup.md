# Cloud Deployment Pipeline Setup

## Fundamental Goal

Operate one cloud environment with one deploy path on `main`, one repo-tracked non-secret infra contract (`infra/azure/environments/cloud.bicepparam`), and one Key Vault secret contract for runtime secrets.

## Pipeline Flow (Push to `main`)

1. Verify commit-stage evidence.
2. Verify integration-gate evidence.
3. Build release-candidate images once and publish digest manifest.
4. Deploy cloud environment with those exact digests.
5. Run production smoke checks.
6. Publish release decision artifacts under `.artifacts/**`.

Replay flow (`cloud-deployment-pipeline-replay.yml`) reuses the same release-candidate manifest by SHA and redeploys without rebuild.

## Required GitHub Production Variables

Required for baseline cloud deploy:

- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_RESOURCE_GROUP`
- `AZURE_GITHUB_CLIENT_ID`
- `ACR_NAME`
- `KEY_VAULT_NAME`

Optional identity-converge path is disabled unless:

- `IDENTITY_CONVERGE_ENABLED=true`
- and all identity backend variables are present.

## Key Vault Secret Contract

Secrets required in `KEY_VAULT_NAME`:

- `postgres-admin-password`
- `web-session-secret`
- `entra-client-secret`
- `auth-oidc-state-encryption-key`
- `oauth-token-signing-secret`

## Scratch Recreate Procedure

Use this to recreate from zero (no data preservation).

1. Set local Azure context and required bootstrap env vars.

```bash
export AZURE_TENANT_ID="<tenant-id>"
export AZURE_SUBSCRIPTION_ID="<subscription-id>"
export AZURE_RESOURCE_GROUP="<target-rg>"
export AZURE_GITHUB_CLIENT_ID="<deploy-app-client-id>"
```

2. Run bootstrap (idempotent):

```bash
node scripts/infra/bootstrap-cloud-environment.mjs
```

Bootstrap performs:

- create resource group
- create ACR (from `cloud.bicepparam`)
- create/update Key Vault (RBAC + template deployment enabled)
- assign deploy principal RBAC (RG + Key Vault secret read)
- seed required Key Vault secrets

3. Configure GitHub production variables for the target environment:

```bash
gh variable set AZURE_RESOURCE_GROUP -e production --body "$AZURE_RESOURCE_GROUP"
gh variable set AZURE_GITHUB_CLIENT_ID -e production --body "$AZURE_GITHUB_CLIENT_ID"
gh variable set ACR_NAME -e production --body "<acr-name-from-cloud.bicepparam>"
gh variable set KEY_VAULT_NAME -e production --body "<kv-name-from-cloud.bicepparam>"
gh variable set IDENTITY_CONVERGE_ENABLED -e production --body "false"
```

4. Push an infra-scope commit to `main` and let `cloud-deployment-pipeline.yml` run.

5. Confirm artifacts exist:

- `.artifacts/release-candidate/<sha>/manifest.json`
- `.artifacts/infra/<sha>/deployment.json`
- `.artifacts/deploy/<sha>/api-smoke.json`
- `.artifacts/release/<sha>/decision.json`

## Failure Policy

- If `main` goes red: fix forward immediately or revert immediately.
- Do not bypass failed gates with ad-hoc variable/secret passthrough.
- Keep release evidence machine-readable under `.artifacts/**`.
