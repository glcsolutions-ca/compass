import { appendGithubOutput, requireEnv, writeJsonFile } from "./pipeline-utils.mjs";

function readOptional(name) {
  return process.env[name]?.trim() || "";
}

function requireOneOfEnv(names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  throw new Error(`Missing required environment variable: one of [${names.join(", ")}]`);
}

function normalizeCustomDomainValidationMethod(value) {
  const normalized = (value || "CNAME").trim().toUpperCase();
  if (!["CNAME", "HTTP", "TXT"].includes(normalized)) {
    throw new Error("ACA_CUSTOM_DOMAIN_VALIDATION_METHOD must be one of CNAME, HTTP, TXT");
  }
  return normalized;
}

function asNumber(name) {
  const value = Number(requireEnv(name));
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be numeric`);
  }
  return value;
}

async function main() {
  const outputPath = requireEnv("ARM_PARAMETERS_FILE");

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
      apiCustomDomain: { value: readOptional("ACA_API_CUSTOM_DOMAIN") },
      webCustomDomain: { value: readOptional("ACA_WEB_CUSTOM_DOMAIN") },
      apiManagedCertificateName: { value: readOptional("ACA_API_MANAGED_CERTIFICATE_NAME") },
      webManagedCertificateName: { value: readOptional("ACA_WEB_MANAGED_CERTIFICATE_NAME") },
      customDomainValidationMethod: {
        value: normalizeCustomDomainValidationMethod(
          process.env.ACA_CUSTOM_DOMAIN_VALIDATION_METHOD
        )
      },
      authIssuer: { value: requireEnv("AUTH_ISSUER") },
      authJwksUri: { value: requireEnv("AUTH_JWKS_URI") },
      authAudience: {
        value: requireOneOfEnv(["AUTH_AUDIENCE", "API_IDENTIFIER_URI", "ENTRA_AUDIENCE"])
      },
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
      migrationJobName: { value: requireEnv("ACA_MIGRATE_JOB_NAME") },
      acrPullIdentityName: { value: requireEnv("ACR_PULL_IDENTITY_NAME") },
      acrName: { value: requireEnv("ACR_NAME") },
      acrSku: { value: requireEnv("ACR_SKU") },
      postgresServerName: { value: requireEnv("POSTGRES_SERVER_NAME") },
      postgresDatabaseName: { value: requireEnv("POSTGRES_DATABASE_NAME") },
      postgresAdminUsername: { value: requireEnv("POSTGRES_ADMIN_USERNAME") },
      postgresVersion: { value: requireEnv("POSTGRES_VERSION") },
      postgresSkuName: { value: requireEnv("POSTGRES_SKU_NAME") },
      postgresSkuTier: { value: requireEnv("POSTGRES_SKU_TIER") },
      postgresStorageMb: { value: asNumber("POSTGRES_STORAGE_MB") },
      postgresAdminPassword: { value: requireEnv("POSTGRES_ADMIN_PASSWORD") },
      apiImage: { value: requireEnv("API_IMAGE") },
      webImage: { value: requireEnv("WEB_IMAGE") }
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
