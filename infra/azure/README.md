# Azure Infrastructure (Bicep)

## Scope and Entry Points

- Stack entry point: `infra/azure/main.bicep`
- Environment parameter template: `infra/azure/environments/prod.bicepparam`
- Reusable resource modules: `infra/azure/modules/*.bicep`
- Pipeline stages:
  - `.github/workflows/deployment-pipeline.yml` (`infra-readonly-acceptance`, validate only)
  - `.github/workflows/deployment-pipeline.yml` (`deploy-approved-candidate`, apply)

## Resource Topology

`main.bicep` composes the production resource graph:

1. Network foundation: VNet, delegated ACA/Postgres subnets, private DNS zone/link.
2. Container Apps managed environment + Log Analytics workspace.
3. Azure Container Registry (ACR) with admin user disabled.
4. Azure Database for PostgreSQL Flexible Server + database.
5. Shared user-assigned managed identity for ACR image pulls.
6. `AcrPull` role assignment at ACR scope for the pull identity.
7. API Container App.
8. Web Container App.
9. Manual-trigger migration ACA Job pinned to API image.

## Module Contract

| Module                                   | Responsibility                                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `modules/network.bicep`                  | Creates VNet, delegated subnets, private DNS zone, and VNet DNS link.                                     |
| `modules/containerapps-env.bicep`        | Creates Log Analytics workspace and ACA managed environment with explicit `Consumption` workload profile. |
| `modules/acr.bicep`                      | Creates ACR and exposes registry ID/name/login server outputs.                                            |
| `modules/postgres-flex.bicep`            | Creates private Postgres Flexible Server and database.                                                    |
| `modules/containerapp-api.bicep`         | Creates API Container App with managed-identity registry pull and secure DB secret wiring.                |
| `modules/containerapp-web.bicep`         | Creates Web Container App with managed-identity registry pull and API base URL wiring.                    |
| `modules/containerapp-job-migrate.bicep` | Creates manual migration job that runs DB migrations using the API image.                                 |

## Parameter Model

Tracked files stay organization-neutral:

- `main.bicep` and `environments/prod.bicepparam` use placeholders for concrete production values.
- Acceptance/production workflows materialize runtime parameters into `.artifacts/infra/<sha>/runtime.parameters.json`.
- `POSTGRES_ADMIN_PASSWORD` is injected at runtime from GitHub environment secrets.
- `apiImage` and `webImage` must be ACR digest refs from accepted candidate evidence.

## Required Production Variables

- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_RESOURCE_GROUP`
- `AZURE_LOCATION`
- `AZURE_VNET_NAME`
- `AZURE_ACA_SUBNET_NAME`
- `AZURE_POSTGRES_SUBNET_NAME`
- `AZURE_PRIVATE_DNS_ZONE_NAME`
- `ACA_ENVIRONMENT_NAME`
- `AZURE_LOG_ANALYTICS_WORKSPACE_NAME`
- `ACA_API_APP_NAME`
- `ACA_WEB_APP_NAME`
- `ACA_MIGRATE_JOB_NAME`
- `ACR_PULL_IDENTITY_NAME`
- `ACR_NAME`
- `ACR_SKU`
- `POSTGRES_SERVER_NAME`
- `POSTGRES_DATABASE_NAME`
- `POSTGRES_ADMIN_USERNAME`
- `POSTGRES_VERSION`
- `POSTGRES_SKU_NAME`
- `POSTGRES_SKU_TIER`
- `POSTGRES_STORAGE_MB`

## Required Production Secrets

- `AZURE_DEPLOY_CLIENT_ID`
- `POSTGRES_ADMIN_PASSWORD`

## Optional Custom Domain Variables

- `ACA_API_CUSTOM_DOMAIN`
- `ACA_WEB_CUSTOM_DOMAIN`
- `ACA_API_MANAGED_CERTIFICATE_NAME`
- `ACA_WEB_MANAGED_CERTIFICATE_NAME`
- `ACA_CUSTOM_DOMAIN_VALIDATION_METHOD`

## Preflight and Fail-Closed Checks

Infra validation/apply fails closed when any contract guard fails:

- Azure account guard: authenticated tenant/subscription must match configured values.
- Resource group guard: resource group location must match configured location.
- Provider guard: required providers must be registered.
- DNS guard: `AZURE_PRIVATE_DNS_ZONE_NAME` must end with `.postgres.database.azure.com`.
- SKU guard: if `POSTGRES_SKU_TIER=Burstable`, `POSTGRES_SKU_NAME` must start with `Standard_B`.
- Custom-domain validation method guard: must be one of `CNAME`, `HTTP`, `TXT`.
- Managed certificate contract guard: custom domain and managed certificate names must be coherent.
- Image ref guard: deployment image refs are normalized to digest form and validated in ACR.

## Apply Behavior and Retry

Production apply behavior is deterministic:

1. Build runtime parameters in `.artifacts/infra/<sha>/runtime.parameters.json`.
2. `scripts/pipeline/production/apply-infra.mjs` runs `az deployment group validate`.
3. If validation succeeds, it runs `az deployment group create`.
4. Create retries once with backoff only for recognized transient ARM/ACA failures.
5. Terminal failures emit explicit stderr diagnostics and artifact logs.

## Outputs Contract

Key outputs from `main.bicep` for operators and downstream validation:

- `containerAppsEnvironmentName` / `containerAppsEnvironmentId` / `containerAppsDefaultDomain`
- `apiBaseUrlOutput`
- `acrId` / `acrNameOutput` / `acrLoginServer`
- `acrPullIdentityId` / `acrPullIdentityPrincipalId`
- `apiContainerAppName` / `apiLatestRevision` / `apiLatestRevisionFqdn`
- `webContainerAppName` / `webLatestRevision` / `webLatestRevisionFqdn`
- `migrationJobName` / `migrationJobId`
- `postgresServerResourceId` / `postgresServerName` / `postgresFqdn` / `postgresDatabaseName`

## Operational Procedures

### Custom domain flow

1. Set custom-domain vars in GitHub `production` environment.
2. Generate DNS records from live ACA state:

```bash
AZURE_RESOURCE_GROUP="<resource-group>" \
ACA_API_APP_NAME="<api-app-name>" \
ACA_WEB_APP_NAME="<web-app-name>" \
ACA_API_CUSTOM_DOMAIN="<api-domain>" \
ACA_WEB_CUSTOM_DOMAIN="<web-domain>" \
pnpm deploy:custom-domain:dns
```

3. Publish emitted `CNAME`/`TXT` records at your DNS provider.
4. Run `deployment-pipeline.yml` for accepted candidate.
5. Verify bindings with `az containerapp hostname list`.

### Replay guidance

- Re-run `deployment-pipeline.yml` with the same `candidate_sha` to verify deterministic convergence.
- Use artifact diffs under `.artifacts/infra/<sha>/` to investigate drift or transient retries.

### Rollback by candidate SHA

- Trigger manual `.github/workflows/deployment-pipeline.yml` with `candidate_sha=<known-good-sha>`.
- Production stage deploys the accepted digest refs for that SHA.

### Artifact locations

- `.artifacts/infra/<sha>/runtime.parameters.json`
- `.artifacts/infra/<sha>/deployment.json`
- `.artifacts/infra/<sha>/deployment-metadata.json`
- `.artifacts/infra/<sha>/deployment-attempts.log`
- `.artifacts/infra/<sha>/deployment.stderr.log`
- `.artifacts/infra/<sha>/managed-certificate-contract.json`

## References

- `.github/workflows/deployment-pipeline.yml`
- `scripts/pipeline/production/apply-infra.mjs`
- `scripts/pipeline/production/assert-managed-certificate-contract.mjs`
- `scripts/pipeline/production/custom-domain-dns.mjs`
- `docs/runbooks/production-stage.md`
