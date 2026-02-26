# Azure Infrastructure (Bicep)

## Scope

- Entry point: `infra/azure/main.bicep`
- Single environment parameters: `infra/azure/environments/cloud.bicepparam`
- Modules: `infra/azure/modules/*.bicep`
- Deploy usage:
  - push pipeline: `.github/workflows/cloud-deployment-pipeline.yml`
  - replay pipeline: `.github/workflows/cloud-deployment-pipeline-replay.yml`

## Target Model

1. One cloud environment.
2. One shared Key Vault.
3. Runtime secrets sourced from Key Vault references in Container Apps.
4. Non-secrets sourced from one repo-tracked Bicep params file.

## What This Deploys

1. VNet + delegated ACA/Postgres subnets + private DNS zone/link.
2. Log Analytics workspace + ACA managed environment.
3. ACR.
4. PostgreSQL Flexible Server + database.
5. Managed identities:
   - ACR pull identity (also used for Key Vault secret references at runtime)
   - Worker runtime identity (queue receiver role assignment)
   - Dynamic Sessions executor identity (session executor role at pool scope)
6. Service Bus namespace + queue baseline (`compass-events`).
7. Container Apps: API, Web, Worker.
8. Dynamic Sessions custom-container session pool.
9. Migration Container App job.

## Secret Contract (Key Vault)

- `postgres-admin-password`
- `web-session-secret`
- `entra-client-secret`
- `auth-oidc-state-encryption-key`
- `oauth-token-signing-secret`

## Bootstrap Contract

The cloud pipeline assumes these prerequisites exist before first push-to-main deploy:

1. Resource group exists.
2. ACR exists (build jobs push release-candidate images before infra apply).
3. Key Vault exists and is seeded with required secrets.
4. Deploy OIDC principal can:
   - mutate the resource group (`Contributor`, `User Access Administrator`)
   - read Key Vault secrets (`Key Vault Secrets User`)
5. Key Vault has `enabledForTemplateDeployment=true` so ARM/Bicep can resolve `az.getSecret(...)`.

Bootstrap command:

```bash
AZURE_SUBSCRIPTION_ID="<sub-id>" \
AZURE_RESOURCE_GROUP="<rg-name>" \
AZURE_GITHUB_CLIENT_ID="<deploy-app-client-id>" \
node scripts/infra/bootstrap-cloud-environment.mjs
```

The bootstrap script uses `infra/azure/environments/cloud.bicepparam` as the source of truth for:

- `location`
- `acrName`
- `acrSku`
- `keyVaultName`

## Apply Behavior

`scripts/pipeline/cloud/deployment-stage/apply-infra.mjs` performs:

1. `az deployment group validate`
2. `az deployment group create` (retry once on known transient failures)
3. Artifact capture in `.artifacts/infra/<sha>/`

Pipeline deploy jobs pass release-candidate digest refs as parameter overrides for:

- `apiImage`
- `webImage`
- `workerImage`
- `dynamicSessionsRuntimeImage`

## Notes

- Key Vault is standup-managed and intentionally not created by Bicep in this repository.
- Runtime secrets do not pass through GitHub workflow env secret values.
- Local development defaults are handled separately (`scripts/dev/ensure-local-env.mjs`).
