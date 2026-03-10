import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ENTRA_REDIRECT_URI_PATH, REPOSITORY_SLUG } from "./public-metadata.mjs";

const execFileAsync = promisify(execFile);

const STRING = "string";
const INTEGER = "integer";

const LIVE_CONFIG_SPECS = Object.freeze([
  { name: "AZURE_DEPLOY_CLIENT_ID", property: "azureDeployClientId", type: STRING },
  { name: "AZURE_TENANT_ID", property: "azureTenantId", type: STRING },
  { name: "AZURE_SUBSCRIPTION_ID", property: "azureSubscriptionId", type: STRING },
  { name: "AZURE_RESOURCE_GROUP", property: "azureResourceGroup", type: STRING },
  { name: "AZURE_LOCATION", property: "azureLocation", type: STRING },
  { name: "AZURE_PUBLIC_DNS_ZONE_NAME", property: "azurePublicDnsZoneName", type: STRING },
  { name: "AZURE_VNET_NAME", property: "azureVnetName", type: STRING },
  { name: "AZURE_ACA_SUBNET_NAME", property: "azureAcaSubnetName", type: STRING },
  { name: "AZURE_POSTGRES_SUBNET_NAME", property: "azurePostgresSubnetName", type: STRING },
  { name: "AZURE_VNET_ADDRESS_PREFIX", property: "azureVnetAddressPrefix", type: STRING },
  { name: "AZURE_ACA_SUBNET_PREFIX", property: "azureAcaSubnetPrefix", type: STRING },
  { name: "AZURE_POSTGRES_SUBNET_PREFIX", property: "azurePostgresSubnetPrefix", type: STRING },
  {
    name: "AZURE_POSTGRES_PRIVATE_DNS_ZONE_NAME",
    property: "azurePostgresPrivateDnsZoneName",
    type: STRING
  },
  { name: "AZURE_CONTAINERAPPS_ENV_NAME", property: "azureContainerAppsEnvName", type: STRING },
  {
    name: "AZURE_LOG_ANALYTICS_WORKSPACE_NAME",
    property: "azureLogAnalyticsWorkspaceName",
    type: STRING
  },
  { name: "AZURE_KEY_VAULT_NAME", property: "azureKeyVaultName", type: STRING },
  { name: "AZURE_POSTGRES_SERVER_NAME", property: "azurePostgresServerName", type: STRING },
  {
    name: "AZURE_POSTGRES_DATABASE_NAME",
    property: "azurePostgresDatabaseName",
    type: STRING
  },
  {
    name: "AZURE_POSTGRES_ADMIN_USERNAME",
    property: "azurePostgresAdminUsername",
    type: STRING
  },
  { name: "AZURE_POSTGRES_SKU_NAME", property: "azurePostgresSkuName", type: STRING },
  { name: "AZURE_POSTGRES_SKU_TIER", property: "azurePostgresSkuTier", type: STRING },
  { name: "AZURE_POSTGRES_VERSION", property: "azurePostgresVersion", type: STRING },
  { name: "AZURE_POSTGRES_STORAGE_MB", property: "azurePostgresStorageMb", type: INTEGER },
  { name: "ACA_API_PROD_APP_NAME", property: "acaApiProdAppName", type: STRING },
  { name: "ACA_WEB_PROD_APP_NAME", property: "acaWebProdAppName", type: STRING },
  { name: "ACA_API_STAGE_APP_NAME", property: "acaApiStageAppName", type: STRING },
  { name: "ACA_WEB_STAGE_APP_NAME", property: "acaWebStageAppName", type: STRING },
  { name: "ACA_MIGRATE_JOB_NAME", property: "acaMigrateJobName", type: STRING },
  { name: "PRODUCTION_WEB_BASE_URL", property: "productionWebBaseUrl", type: STRING },
  { name: "AUTH_MODE", property: "authMode", type: STRING },
  { name: "ENTRA_WEB_CLIENT_ID", property: "entraWebClientId", type: STRING },
  { name: "ENTRA_ALLOWED_TENANT_IDS", property: "entraAllowedTenantIds", type: STRING },
  {
    name: "DYNAMIC_SESSIONS_POOL_MANAGEMENT_ENDPOINT",
    property: "dynamicSessionsPoolManagementEndpoint",
    type: STRING
  },
  { name: "API_LOG_LEVEL", property: "apiLogLevel", type: STRING },
  { name: "DB_MIGRATION_LOCK_TIMEOUT", property: "dbMigrationLockTimeout", type: STRING },
  {
    name: "DB_MIGRATION_STATEMENT_TIMEOUT",
    property: "dbMigrationStatementTimeout",
    type: STRING
  },
  { name: "SEED_DEFAULT_TENANT_ID", property: "seedDefaultTenantId", type: STRING },
  {
    name: "SEED_DEFAULT_APP_CLIENT_ID",
    property: "seedDefaultAppClientId",
    type: STRING,
    allowEmpty: true
  },
  {
    name: "SEED_DEFAULT_USER_OID",
    property: "seedDefaultUserOid",
    type: STRING,
    allowEmpty: true
  },
  { name: "SEED_DEFAULT_USER_EMAIL", property: "seedDefaultUserEmail", type: STRING },
  {
    name: "SEED_DEFAULT_USER_DISPLAY_NAME",
    property: "seedDefaultUserDisplayName",
    type: STRING
  }
]);

const SPEC_BY_NAME = new Map(LIVE_CONFIG_SPECS.map((spec) => [spec.name, spec]));

export const REQUIRED_REPO_VARIABLE_NAMES = Object.freeze(
  LIVE_CONFIG_SPECS.filter((spec) => !spec.allowEmpty).map((spec) => spec.name)
);

export const ENTRA_BOOTSTRAP_VARIABLE_NAMES = Object.freeze([
  "AZURE_TENANT_ID",
  "AZURE_SUBSCRIPTION_ID",
  "AZURE_RESOURCE_GROUP",
  "PRODUCTION_WEB_BASE_URL"
]);

export const INFRA_VARIABLE_NAMES = Object.freeze([
  "AZURE_TENANT_ID",
  "AZURE_SUBSCRIPTION_ID",
  "AZURE_RESOURCE_GROUP",
  "AZURE_LOCATION",
  "AZURE_PUBLIC_DNS_ZONE_NAME",
  "AZURE_VNET_NAME",
  "AZURE_ACA_SUBNET_NAME",
  "AZURE_POSTGRES_SUBNET_NAME",
  "AZURE_VNET_ADDRESS_PREFIX",
  "AZURE_ACA_SUBNET_PREFIX",
  "AZURE_POSTGRES_SUBNET_PREFIX",
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
  "AZURE_POSTGRES_STORAGE_MB"
]);

export const BOOTSTRAP_APPS_VARIABLE_NAMES = Object.freeze([
  ...INFRA_VARIABLE_NAMES,
  "ACA_API_PROD_APP_NAME",
  "ACA_WEB_PROD_APP_NAME",
  "ACA_API_STAGE_APP_NAME",
  "ACA_WEB_STAGE_APP_NAME",
  "ACA_MIGRATE_JOB_NAME",
  "PRODUCTION_WEB_BASE_URL",
  "AUTH_MODE",
  "ENTRA_WEB_CLIENT_ID",
  "ENTRA_ALLOWED_TENANT_IDS",
  "DYNAMIC_SESSIONS_POOL_MANAGEMENT_ENDPOINT",
  "API_LOG_LEVEL",
  "DB_MIGRATION_LOCK_TIMEOUT",
  "DB_MIGRATION_STATEMENT_TIMEOUT",
  "SEED_DEFAULT_TENANT_ID",
  "SEED_DEFAULT_APP_CLIENT_ID",
  "SEED_DEFAULT_USER_OID",
  "SEED_DEFAULT_USER_EMAIL",
  "SEED_DEFAULT_USER_DISPLAY_NAME"
]);

export const WEB_DOMAIN_VARIABLE_NAMES = Object.freeze([
  "AZURE_RESOURCE_GROUP",
  "AZURE_PUBLIC_DNS_ZONE_NAME",
  "AZURE_CONTAINERAPPS_ENV_NAME",
  "ACA_WEB_PROD_APP_NAME",
  "PRODUCTION_WEB_BASE_URL"
]);

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseInteger(name, value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be an integer (received '${value}')`);
  }
  return parsed;
}

function parseValue(spec, value) {
  if (spec.type === INTEGER) {
    return parseInteger(spec.name, value);
  }
  return value;
}

function normalizeRequestedNames(requiredVariableNames, optionalVariableNames) {
  const names = [...new Set([...requiredVariableNames, ...optionalVariableNames])];
  for (const name of names) {
    if (!SPEC_BY_NAME.has(name)) {
      throw new Error(`Unknown live config variable '${name}'`);
    }
  }
  return names;
}

export function deriveProductionWebCustomDomain(productionWebBaseUrl) {
  const url = new URL(String(productionWebBaseUrl || "").trim());
  return url.host;
}

export function buildEntraRedirectUri(productionWebBaseUrl) {
  const origin = new URL(String(productionWebBaseUrl || "").trim()).origin.replace(/\/+$/u, "");
  return `${origin}${ENTRA_REDIRECT_URI_PATH}`;
}

export function normalizeLivePlatformConfig(values, { repository = REPOSITORY_SLUG } = {}) {
  const resolved = {
    repository,
    variables: {}
  };

  for (const spec of LIVE_CONFIG_SPECS) {
    if (!(spec.name in values)) {
      continue;
    }
    resolved.variables[spec.name] = values[spec.name];
    resolved[spec.property] = parseValue(spec, values[spec.name]);
  }

  if (resolved.productionWebBaseUrl) {
    resolved.productionWebCustomDomain = deriveProductionWebCustomDomain(
      resolved.productionWebBaseUrl
    );
    resolved.entraRedirectUri = buildEntraRedirectUri(resolved.productionWebBaseUrl);
  }

  return resolved;
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

export async function loadLivePlatformConfig({
  env = process.env,
  repository = REPOSITORY_SLUG,
  requiredVariableNames = REQUIRED_REPO_VARIABLE_NAMES,
  optionalVariableNames = [],
  getRepositoryVariable = fetchRepositoryVariable
} = {}) {
  const requestedNames = normalizeRequestedNames(requiredVariableNames, optionalVariableNames);
  const requiredSet = new Set(requiredVariableNames);
  const values = {};
  const missing = [];

  await Promise.all(
    requestedNames.map(async (name) => {
      const spec = SPEC_BY_NAME.get(name);
      const explicit = trimString(env[name]);
      if (explicit || (spec?.allowEmpty && typeof env[name] === "string")) {
        values[name] = explicit;
        return;
      }

      const fetched = await getRepositoryVariable(name, { repository });
      if (
        typeof fetched === "string" &&
        (fetched.length > 0 || spec?.allowEmpty)
      ) {
        values[name] = fetched;
        return;
      }

      if (requiredSet.has(name)) {
        missing.push(name);
      }
    })
  );

  if (missing.length > 0) {
    missing.sort();
    throw new Error(`Missing required repository variables:\n${missing.map((name) => `- ${name}`).join("\n")}`);
  }

  return normalizeLivePlatformConfig(values, { repository });
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
    seedDefaultAppClientId: config.seedDefaultAppClientId || config.entraWebClientId,
    seedDefaultUserOid: config.seedDefaultUserOid,
    seedDefaultUserEmail: config.seedDefaultUserEmail,
    seedDefaultUserDisplayName: config.seedDefaultUserDisplayName
  };
}
