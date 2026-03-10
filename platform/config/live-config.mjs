import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { REPOSITORY_SLUG } from "./public-metadata.mjs";
import {
  buildDeploymentNaming,
  buildEntraRedirectUri,
  deriveProductionWebCustomDomain
} from "./naming.mjs";

const execFileAsync = promisify(execFile);

const STRING = "string";

const LIVE_CONFIG_SPECS = Object.freeze([
  { name: "AZURE_DEPLOY_CLIENT_ID", property: "azureDeployClientId", type: STRING },
  { name: "AZURE_TENANT_ID", property: "azureTenantId", type: STRING },
  { name: "AZURE_SUBSCRIPTION_ID", property: "azureSubscriptionId", type: STRING },
  { name: "AZURE_LOCATION", property: "azureLocation", type: STRING },
  { name: "DEPLOYMENT_STAMP", property: "deploymentStamp", type: STRING },
  { name: "PRODUCTION_WEB_BASE_URL", property: "productionWebBaseUrl", type: STRING },
  { name: "AUTH_MODE", property: "authMode", type: STRING },
  { name: "ENTRA_WEB_CLIENT_ID", property: "entraWebClientId", type: STRING },
  { name: "ENTRA_ALLOWED_TENANT_IDS", property: "entraAllowedTenantIds", type: STRING },
  { name: "AZURE_VNET_ADDRESS_PREFIX", property: "azureVnetAddressPrefix", type: STRING },
  { name: "AZURE_ACA_SUBNET_PREFIX", property: "azureAcaSubnetPrefix", type: STRING },
  { name: "AZURE_POSTGRES_SUBNET_PREFIX", property: "azurePostgresSubnetPrefix", type: STRING }
]);

const SPEC_BY_NAME = new Map(LIVE_CONFIG_SPECS.map((spec) => [spec.name, spec]));

export const REQUIRED_REPO_VARIABLE_NAMES = Object.freeze(LIVE_CONFIG_SPECS.map((spec) => spec.name));

export const DELIVERY_REPO_VARIABLE_NAMES = Object.freeze([
  "AZURE_DEPLOY_CLIENT_ID",
  "AZURE_TENANT_ID",
  "AZURE_SUBSCRIPTION_ID",
  "AZURE_LOCATION",
  "DEPLOYMENT_STAMP",
  "PRODUCTION_WEB_BASE_URL",
  "AUTH_MODE",
  "ENTRA_WEB_CLIENT_ID",
  "ENTRA_ALLOWED_TENANT_IDS"
]);

export const INFRASTRUCTURE_REPO_VARIABLE_NAMES = Object.freeze([
  ...DELIVERY_REPO_VARIABLE_NAMES,
  "AZURE_VNET_ADDRESS_PREFIX",
  "AZURE_ACA_SUBNET_PREFIX",
  "AZURE_POSTGRES_SUBNET_PREFIX"
]);

export const DEPRECATED_REPO_VARIABLE_NAMES = Object.freeze([
  "AZURE_RESOURCE_GROUP",
  "AZURE_PUBLIC_DNS_ZONE_NAME",
  "AZURE_VNET_NAME",
  "AZURE_ACA_SUBNET_NAME",
  "AZURE_POSTGRES_SUBNET_NAME",
  "AZURE_POSTGRES_PRIVATE_DNS_ZONE_NAME",
  "AZURE_CONTAINERAPPS_ENV_NAME",
  "AZURE_LOG_ANALYTICS_WORKSPACE_NAME",
  "AZURE_KEY_VAULT_NAME",
  "AZURE_POSTGRES_SERVER_NAME",
  "AZURE_POSTGRES_DATABASE_NAME",
  "AZURE_POSTGRES_ADMIN_USERNAME",
  "AZURE_POSTGRES_SKU_NAME",
  "AZURE_POSTGRES_SKU_TIER",
  "AZURE_POSTGRES_VERSION",
  "AZURE_POSTGRES_STORAGE_MB",
  "ACA_API_PROD_APP_NAME",
  "ACA_WEB_PROD_APP_NAME",
  "ACA_API_STAGE_APP_NAME",
  "ACA_WEB_STAGE_APP_NAME",
  "ACA_MIGRATE_JOB_NAME",
  "DYNAMIC_SESSIONS_POOL_MANAGEMENT_ENDPOINT",
  "API_LOG_LEVEL",
  "DB_MIGRATION_LOCK_TIMEOUT",
  "DB_MIGRATION_STATEMENT_TIMEOUT",
  "SEED_DEFAULT_TENANT_ID",
  "SEED_DEFAULT_APP_CLIENT_ID",
  "SEED_DEFAULT_USER_OID",
  "SEED_DEFAULT_USER_EMAIL",
  "SEED_DEFAULT_USER_DISPLAY_NAME",
  "PRODUCTION_API_BASE_URL",
  "ENTRA_API_CLIENT_ID"
]);

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRequestedNames(requiredVariableNames) {
  const names = [...new Set(requiredVariableNames)];
  for (const name of names) {
    if (!SPEC_BY_NAME.has(name)) {
      throw new Error(`Unknown live config variable '${name}'`);
    }
  }
  return names;
}

function normalizeBaseConfig(values, { repository = REPOSITORY_SLUG } = {}) {
  const resolved = {
    repository,
    variables: {}
  };

  for (const spec of LIVE_CONFIG_SPECS) {
    if (!(spec.name in values)) {
      continue;
    }
    resolved.variables[spec.name] = values[spec.name];
    resolved[spec.property] = values[spec.name];
  }

  return resolved;
}

function buildResolvedConfig(baseConfig) {
  return {
    ...baseConfig,
    ...buildDeploymentNaming({
      deploymentStamp: baseConfig.deploymentStamp,
      productionWebBaseUrl: baseConfig.productionWebBaseUrl,
      azureLocation: baseConfig.azureLocation,
      azureSubscriptionId: baseConfig.azureSubscriptionId,
      azureTenantId: baseConfig.azureTenantId
    })
  };
}

export async function fetchRepositoryVariable(name, { repository = REPOSITORY_SLUG } = {}) {
  try {
    const { stdout } = await execFileAsync(
      "gh",
      ["api", `repos/${repository}/actions/variables/${name}`],
      {
        env: process.env,
        maxBuffer: 20 * 1024 * 1024
      }
    );
    const payload = JSON.parse(String(stdout || "{}"));
    return typeof payload?.value === "string" ? payload.value.trim() : "";
  } catch (error) {
    const message = [error?.message, error?.stderr, error?.stdout].filter(Boolean).join("\n");
    if (/404|not found/iu.test(message)) {
      return undefined;
    }
    throw error;
  }
}

async function loadBaseConfig({
  env = process.env,
  repository = REPOSITORY_SLUG,
  requiredVariableNames = REQUIRED_REPO_VARIABLE_NAMES,
  getRepositoryVariable = fetchRepositoryVariable
} = {}) {
  const requestedNames = normalizeRequestedNames(requiredVariableNames);
  const values = {};
  const missing = [];

  await Promise.all(
    requestedNames.map(async (name) => {
      const explicit = trimString(env[name]);
      if (explicit) {
        values[name] = explicit;
        return;
      }

      const fetched = await getRepositoryVariable(name, { repository });
      if (typeof fetched === "string" && fetched.length > 0) {
        values[name] = fetched;
        return;
      }

      missing.push(name);
    })
  );

  if (missing.length > 0) {
    missing.sort();
    throw new Error(
      `Missing required repository variables:\n${missing.map((name) => `- ${name}`).join("\n")}`
    );
  }

  return normalizeBaseConfig(values, { repository });
}

export async function loadDeliveryConfig(options = {}) {
  return buildResolvedConfig(
    await loadBaseConfig({
      ...options,
      requiredVariableNames: DELIVERY_REPO_VARIABLE_NAMES
    })
  );
}

export async function loadInfrastructureConfig(options = {}) {
  return buildResolvedConfig(
    await loadBaseConfig({
      ...options,
      requiredVariableNames: INFRASTRUCTURE_REPO_VARIABLE_NAMES
    })
  );
}

export function buildMainTemplateParameters(config, { postgresAdminPassword }) {
  return {
    location: config.azureLocation,
    vnetName: config.azureVnetName,
    acaSubnetName: config.azureAcaSubnetName,
    postgresSubnetName: config.azurePostgresSubnetName,
    vnetAddressPrefix: config.azureVnetAddressPrefix,
    acaSubnetPrefix: config.azureAcaSubnetPrefix,
    postgresSubnetPrefix: config.azurePostgresSubnetPrefix,
    privateDnsZoneName: config.azurePostgresPrivateDnsZoneName,
    environmentName: config.azureContainerAppsEnvName,
    logAnalyticsWorkspaceName: config.azureLogAnalyticsWorkspaceName,
    keyVaultName: config.azureKeyVaultName,
    postgresServerName: config.azurePostgresServerName,
    postgresDatabaseName: config.azurePostgresDatabaseName,
    postgresAdminUsername: config.azurePostgresAdminUsername,
    postgresAdminPassword,
    postgresSkuName: config.azurePostgresSkuName,
    postgresSkuTier: config.azurePostgresSkuTier,
    postgresVersion: config.azurePostgresVersion,
    postgresStorageMb: config.azurePostgresStorageMb,
    dnsZoneName: config.azurePublicDnsZoneName
  };
}

export function buildAppsBootstrapParameters(
  config,
  {
    postgresAdminPassword,
    apiProdImage,
    webProdImage,
    apiStageImage = apiProdImage,
    webStageImage = webProdImage,
    migrationsImage = apiProdImage
  }
) {
  return {
    location: config.azureLocation,
    environmentName: config.azureContainerAppsEnvName,
    keyVaultName: config.azureKeyVaultName,
    postgresServerName: config.azurePostgresServerName,
    postgresDatabaseName: config.azurePostgresDatabaseName,
    postgresAdminUsername: config.azurePostgresAdminUsername,
    postgresAdminPassword,
    apiProdAppName: config.acaApiProdAppName,
    webProdAppName: config.acaWebProdAppName,
    apiStageAppName: config.acaApiStageAppName,
    webStageAppName: config.acaWebStageAppName,
    migrationJobName: config.acaMigrateJobName,
    apiProdImage,
    webProdImage,
    apiStageImage,
    webStageImage,
    migrationsImage,
    authMode: config.authMode,
    entraClientId: config.entraWebClientId,
    entraAllowedTenantIds: config.entraAllowedTenantIds,
    publicWebBaseUrl: config.productionWebBaseUrl,
    dynamicSessionsPoolManagementEndpoint: config.dynamicSessionsPoolManagementEndpoint,
    apiLogLevel: config.apiLogLevel,
    migrationLockTimeout: config.dbMigrationLockTimeout,
    migrationStatementTimeout: config.dbMigrationStatementTimeout,
    seedDefaultTenantId: config.seedDefaultTenantId,
    seedDefaultAppClientId: config.seedDefaultAppClientId,
    seedDefaultUserOid: config.seedDefaultUserOid,
    seedDefaultUserEmail: config.seedDefaultUserEmail,
    seedDefaultUserDisplayName: config.seedDefaultUserDisplayName
  };
}

export { buildEntraRedirectUri, deriveProductionWebCustomDomain };
