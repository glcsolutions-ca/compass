import { appendGithubOutput, requireEnv, writeJsonFile } from "./pipeline-utils.mjs";

function readOptional(name) {
  return process.env[name]?.trim() || "";
}

function readBooleanFlag(name, { required = false } = {}) {
  const raw = required ? requireEnv(name) : readOptional(name);
  if (!raw) {
    return "false";
  }

  const normalized = raw.toLowerCase();
  if (normalized !== "true" && normalized !== "false") {
    throw new Error(`${name} must be 'true' or 'false'`);
  }

  return normalized;
}

async function main() {
  const outputPath = requireEnv("ARM_PARAMETERS_FILE");
  const tenantId = requireEnv("AZURE_TENANT_ID");
  const authIssuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
  const authJwksUri = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
  const entraLoginEnabled = readBooleanFlag("ENTRA_LOGIN_ENABLED", { required: true });
  const authDevFallbackEnabled = readBooleanFlag("AUTH_DEV_FALLBACK_ENABLED", {
    required: true
  });

  const payload = {
    $schema: "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
    contentVersion: "1.0.0.0",
    parameters: {
      location: { value: requireEnv("AZURE_LOCATION") },
      vnetName: { value: requireEnv("AZURE_VNET_NAME") },
      acaSubnetName: { value: requireEnv("AZURE_ACA_SUBNET_NAME") },
      postgresSubnetName: { value: requireEnv("AZURE_POSTGRES_SUBNET_NAME") },
      privateDnsZoneName: { value: requireEnv("AZURE_PRIVATE_DNS_ZONE_NAME") },
      environmentName: { value: requireEnv("ACA_ENVIRONMENT_NAME") },
      logAnalyticsWorkspaceName: { value: requireEnv("AZURE_LOG_ANALYTICS_WORKSPACE_NAME") },
      apiAppName: { value: requireEnv("ACA_API_APP_NAME") },
      webAppName: { value: requireEnv("ACA_WEB_APP_NAME") },
      workerAppName: { value: requireEnv("ACA_WORKER_APP_NAME") },
      workerRuntimeIdentityName: { value: requireEnv("WORKER_RUNTIME_IDENTITY_NAME") },
      codexAppName: { value: requireEnv("ACA_CODEX_APP_NAME") },
      dynamicSessionsPoolName: { value: requireEnv("DYNAMIC_SESSIONS_POOL_NAME") },
      dynamicSessionsExecutorIdentityName: {
        value: requireEnv("DYNAMIC_SESSIONS_EXECUTOR_IDENTITY_NAME")
      },
      webSessionSecret: { value: requireEnv("WEB_SESSION_SECRET") },
      entraLoginEnabled: { value: entraLoginEnabled },
      entraClientId: { value: readOptional("ENTRA_CLIENT_ID") },
      entraClientSecret: { value: readOptional("ENTRA_CLIENT_SECRET") },
      entraAllowedTenantIds: { value: readOptional("ENTRA_ALLOWED_TENANT_IDS") },
      authDevFallbackEnabled: { value: authDevFallbackEnabled },
      apiCustomDomain: { value: readOptional("ACA_API_CUSTOM_DOMAIN") },
      webCustomDomain: { value: readOptional("ACA_WEB_CUSTOM_DOMAIN") },
      codexCustomDomain: { value: readOptional("ACA_CODEX_CUSTOM_DOMAIN") },
      authIssuer: { value: authIssuer },
      authJwksUri: { value: authJwksUri },
      authAudience: { value: requireEnv("AUTH_AUDIENCE") },
      authAllowedClientIds: { value: requireEnv("AUTH_ALLOWED_CLIENT_IDS") },
      authActiveTenantIds: { value: requireEnv("AUTH_ACTIVE_TENANT_IDS") },
      oauthTokenIssuer: { value: requireEnv("OAUTH_TOKEN_ISSUER") },
      oauthTokenAudience: { value: requireEnv("OAUTH_TOKEN_AUDIENCE") },
      oauthTokenSigningSecret: { value: requireEnv("OAUTH_TOKEN_SIGNING_SECRET") },
      authBootstrapAllowedTenantId: { value: requireEnv("AUTH_BOOTSTRAP_ALLOWED_TENANT_ID") },
      authBootstrapAllowedAppClientId: {
        value: requireEnv("AUTH_BOOTSTRAP_ALLOWED_APP_CLIENT_ID")
      },
      authBootstrapDelegatedUserOid: { value: requireEnv("AUTH_BOOTSTRAP_DELEGATED_USER_OID") },
      authBootstrapDelegatedUserEmail: {
        value: requireEnv("AUTH_BOOTSTRAP_DELEGATED_USER_EMAIL")
      },
      migrationLockTimeout: {
        value: readOptional("MIGRATION_LOCK_TIMEOUT") || "5s"
      },
      migrationStatementTimeout: {
        value: readOptional("MIGRATION_STATEMENT_TIMEOUT") || "15min"
      },
      migrationJobName: { value: requireEnv("ACA_MIGRATE_JOB_NAME") },
      acrPullIdentityName: { value: requireEnv("ACR_PULL_IDENTITY_NAME") },
      acrName: { value: requireEnv("ACR_NAME") },
      postgresServerName: { value: requireEnv("POSTGRES_SERVER_NAME") },
      postgresDatabaseName: { value: requireEnv("POSTGRES_DATABASE_NAME") },
      postgresAdminUsername: { value: requireEnv("POSTGRES_ADMIN_USERNAME") },
      postgresAdminPassword: { value: requireEnv("POSTGRES_ADMIN_PASSWORD") },
      apiImage: { value: requireEnv("API_IMAGE") },
      webImage: { value: requireEnv("WEB_IMAGE") },
      workerImage: { value: requireEnv("WORKER_IMAGE") },
      codexImage: { value: requireEnv("CODEX_IMAGE") },
      dynamicSessionsRuntimeImage: { value: requireEnv("DYNAMIC_SESSIONS_RUNTIME_IMAGE") },
      serviceBusProdNamespaceName: { value: requireEnv("SERVICE_BUS_PROD_NAMESPACE_NAME") },
      serviceBusAcceptanceNamespaceName: {
        value: requireEnv("SERVICE_BUS_ACCEPTANCE_NAMESPACE_NAME")
      },
      serviceBusQueueName: { value: requireEnv("SERVICE_BUS_QUEUE_NAME") },
      workerRunMode: { value: readOptional("WORKER_RUN_MODE") || "loop" }
    }
  };

  await writeJsonFile(outputPath, payload);
  await appendGithubOutput({ arm_parameters_file: outputPath });

  console.info(`Rendered infra ARM parameters: ${outputPath}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
