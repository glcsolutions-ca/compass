import { ENTRA_REDIRECT_URI_PATH } from "./public-metadata.mjs";

export const PRODUCT_SLUG = "compass";

export const DEFAULT_PLATFORM_VALUES = Object.freeze({
  postgresDatabaseName: "compass",
  postgresAdminUsername: "compassadmin",
  postgresSkuName: "Standard_B1ms",
  postgresSkuTier: "Burstable",
  postgresVersion: "16",
  postgresStorageMb: 32768,
  apiLogLevel: "warn",
  dbMigrationLockTimeout: "5s",
  dbMigrationStatementTimeout: "15min",
  seedDefaultAppClientId: "",
  seedDefaultUserOid: "",
  seedDefaultUserEmail: "admin@compass.local",
  seedDefaultUserDisplayName: "Production Admin"
});

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function requireTrimmed(name, value) {
  const normalized = trimString(value);
  if (!normalized) {
    throw new Error(`${name} is required`);
  }
  return normalized;
}

export function deriveProductionWebCustomDomain(productionWebBaseUrl) {
  return new URL(requireTrimmed("PRODUCTION_WEB_BASE_URL", productionWebBaseUrl)).host;
}

export function buildEntraRedirectUri(productionWebBaseUrl) {
  const origin = new URL(
    requireTrimmed("PRODUCTION_WEB_BASE_URL", productionWebBaseUrl)
  ).origin.replace(/\/+$/u, "");
  return `${origin}${ENTRA_REDIRECT_URI_PATH}`;
}

export function buildDeploymentNaming({
  deploymentStamp,
  productionWebBaseUrl,
  azureLocation,
  azureSubscriptionId,
  azureTenantId
}) {
  const stamp = requireTrimmed("DEPLOYMENT_STAMP", deploymentStamp);
  const location = requireTrimmed("AZURE_LOCATION", azureLocation);
  const subscriptionId = requireTrimmed("AZURE_SUBSCRIPTION_ID", azureSubscriptionId);
  const tenantId = requireTrimmed("AZURE_TENANT_ID", azureTenantId);
  const productionWebCustomDomain = deriveProductionWebCustomDomain(productionWebBaseUrl);
  const azureResourceGroup = `rg-${PRODUCT_SLUG}-${stamp}`;
  const dynamicSessionsPoolName = `sp-${PRODUCT_SLUG}-agent-${stamp}`;

  return {
    deploymentStamp: stamp,
    azureResourceGroup,
    azurePublicDnsZoneName: productionWebCustomDomain,
    azureVnetName: `vnet-${PRODUCT_SLUG}-${stamp}`,
    azureAcaSubnetName: `snet-${PRODUCT_SLUG}-aca-${stamp}`,
    azurePostgresSubnetName: `snet-${PRODUCT_SLUG}-psql-${stamp}`,
    azurePostgresPrivateDnsZoneName: `${PRODUCT_SLUG}-${stamp}.postgres.database.azure.com`,
    azureContainerAppsEnvName: `cae-${PRODUCT_SLUG}-${stamp}`,
    azureLogAnalyticsWorkspaceName: `law-${PRODUCT_SLUG}-${stamp}`,
    azureKeyVaultName: `kv-${PRODUCT_SLUG}-${stamp}`,
    azurePostgresServerName: `psql-${PRODUCT_SLUG}-${stamp}`,
    azurePostgresDatabaseName: DEFAULT_PLATFORM_VALUES.postgresDatabaseName,
    azurePostgresAdminUsername: DEFAULT_PLATFORM_VALUES.postgresAdminUsername,
    azurePostgresSkuName: DEFAULT_PLATFORM_VALUES.postgresSkuName,
    azurePostgresSkuTier: DEFAULT_PLATFORM_VALUES.postgresSkuTier,
    azurePostgresVersion: DEFAULT_PLATFORM_VALUES.postgresVersion,
    azurePostgresStorageMb: DEFAULT_PLATFORM_VALUES.postgresStorageMb,
    acaApiProdAppName: `ca-${PRODUCT_SLUG}-api-${stamp}`,
    acaWebProdAppName: `ca-${PRODUCT_SLUG}-web-${stamp}`,
    acaApiStageAppName: `ca-${PRODUCT_SLUG}-api-stg-${stamp}`,
    acaWebStageAppName: `ca-${PRODUCT_SLUG}-web-stg-${stamp}`,
    acaMigrateJobName: `caj-${PRODUCT_SLUG}-migrate-${stamp}`,
    dynamicSessionsPoolName,
    dynamicSessionsPoolManagementEndpoint: `https://${location}.dynamicsessions.io/subscriptions/${subscriptionId}/resourceGroups/${azureResourceGroup}/sessionPools/${dynamicSessionsPoolName}`,
    productionWebCustomDomain,
    entraRedirectUri: buildEntraRedirectUri(productionWebBaseUrl),
    apiLogLevel: DEFAULT_PLATFORM_VALUES.apiLogLevel,
    dbMigrationLockTimeout: DEFAULT_PLATFORM_VALUES.dbMigrationLockTimeout,
    dbMigrationStatementTimeout: DEFAULT_PLATFORM_VALUES.dbMigrationStatementTimeout,
    seedDefaultTenantId: tenantId,
    seedDefaultAppClientId: DEFAULT_PLATFORM_VALUES.seedDefaultAppClientId,
    seedDefaultUserOid: DEFAULT_PLATFORM_VALUES.seedDefaultUserOid,
    seedDefaultUserEmail: DEFAULT_PLATFORM_VALUES.seedDefaultUserEmail,
    seedDefaultUserDisplayName: DEFAULT_PLATFORM_VALUES.seedDefaultUserDisplayName
  };
}
