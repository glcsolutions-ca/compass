# Azure Infrastructure (Bicep)

## Scope and Entry Points

- Stack entry point: `infra/azure/main.bicep`
- Environment parameter template: `infra/azure/environments/prod.bicepparam`
- Reusable resource modules: `infra/azure/modules/*.bicep`
- Production mutation workflow: `.github/workflows/infra-apply.yml`

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

- `main.bicep` and `environments/prod.bicepparam` use `SET_IN_GITHUB_ENV` placeholders for concrete production values.
- `.github/workflows/infra-apply.yml` materializes a runtime parameter payload into `.artifacts/infra/<sha>/runtime.parameters.json`.
- `POSTGRES_ADMIN_PASSWORD` is injected at runtime from GitHub environment secrets.
- `apiImage` and `webImage` are resolved to ACR digest refs before apply.

## Required Production Variables (infra-apply)

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

## Required Production Secrets (infra-apply)

- `AZURE_DEPLOY_CLIENT_ID`
- `POSTGRES_ADMIN_PASSWORD`

## Optional Custom Domain Variables

- `ACA_API_CUSTOM_DOMAIN`
- `ACA_WEB_CUSTOM_DOMAIN`
- `ACA_API_MANAGED_CERTIFICATE_NAME`
- `ACA_WEB_MANAGED_CERTIFICATE_NAME`
- `ACA_CUSTOM_DOMAIN_VALIDATION_METHOD`

## Preflight and Fail-Closed Checks

`infra-apply` fails closed when any contract guard fails:

- Azure account guard: authenticated tenant/subscription must match configured values.
- Resource group guard: resource group location must match configured location.
- Provider guard: required providers must be registered (`Microsoft.App`, `Microsoft.ContainerService`, `Microsoft.Network`, `Microsoft.DBforPostgreSQL`, `Microsoft.OperationalInsights`).
- DNS guard: `AZURE_PRIVATE_DNS_ZONE_NAME` must end with `.postgres.database.azure.com`.
- SKU guard: if `POSTGRES_SKU_TIER=Burstable`, `POSTGRES_SKU_NAME` must start with `Standard_B`.
- Custom-domain validation method guard: value must be one of `CNAME`, `HTTP`, `TXT`.
- Managed certificate contract guard: custom domain and managed certificate names must be coherent.
- ACR auth guard: `authentication-as-arm` is converged to enabled.
- Image ref guard: deployment image refs are normalized to digest form and validated in ACR.

## Apply Behavior and Retry

Deployment behavior is deterministic:

1. Workflow resolves runtime variables/secrets into `.artifacts/infra/<sha>/runtime.parameters.json`.
2. `scripts/deploy/apply-bicep-template.mjs` runs `az deployment group validate`.
3. If validation succeeds, it runs `az deployment group create`.
4. Create retries once with 20 second backoff only for recognized transient ARM/ACA failures.
5. Terminal failures emit explicit stderr diagnostics and artifact logs.

## Outputs Contract

Key outputs from `main.bicep` for operators and downstream validation:

| Output                                                                                       | Meaning                                                                      |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `containerAppsEnvironmentName` / `containerAppsEnvironmentId` / `containerAppsDefaultDomain` | ACA managed environment identity and default ingress domain.                 |
| `apiBaseUrlOutput`                                                                           | Effective API base URL (custom domain if configured, else ACA default host). |
| `acrId` / `acrNameOutput` / `acrLoginServer`                                                 | ACR identity and registry endpoint details.                                  |
| `acrPullIdentityId` / `acrPullIdentityPrincipalId`                                           | Shared pull identity resource and principal IDs.                             |
| `apiContainerAppName` / `apiLatestRevision` / `apiLatestRevisionFqdn`                        | API app identity and latest revision/FQDN info.                              |
| `webContainerAppName` / `webLatestRevision` / `webLatestRevisionFqdn`                        | Web app identity and latest revision/FQDN info.                              |
| `migrationJobName` / `migrationJobId`                                                        | Migration job identity outputs.                                              |
| `postgresServerResourceId` / `postgresServerName` / `postgresFqdn` / `postgresDatabaseName`  | Postgres resource identity and connection host context.                      |

## Operational Procedures

### Custom domain flow

1. Set optional custom-domain variables in GitHub `production` environment.
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
4. Run `infra-apply` to mint/bind managed certificates and hostnames.
5. Verify bindings with `az containerapp hostname list`.

### Replay guidance

- Re-run `infra-apply` on the same SHA after a successful run to validate idempotent convergence.
- Use artifact diffs under `.artifacts/infra/<sha>/` to investigate drift or transient retries.

### Rollback by `image_tag`

- Trigger manual `.github/workflows/infra-apply.yml` with `image_tag=<known-good-tag>`.
- Workflow resolves tags to digests and re-applies the stack with pinned image refs.

### Artifact locations

- `.artifacts/infra/<sha>/runtime.parameters.json`
- `.artifacts/infra/<sha>/deployment.json`
- `.artifacts/infra/<sha>/deployment-metadata.json`
- `.artifacts/infra/<sha>/deployment-attempts.log`
- `.artifacts/infra/<sha>/deployment.stderr.log`
- `.artifacts/infra/<sha>/managed-certificate-contract.json`

## References

- `.github/workflows/infra-apply.yml`
- `.github/workflows/deploy.yml`
- `scripts/deploy/apply-bicep-template.mjs`
- `scripts/deploy/assert-managed-certificate-contract.mjs`
- `scripts/deploy/custom-domain-dns.mjs`
- `docs/runbooks/deploy-aca.md`
