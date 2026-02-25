import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { requireEnv } from "./pipeline-utils.mjs";

const execFileAsync = promisify(execFile);

const REQUIRED_ENV_NAMES = [
  "AZURE_TENANT_ID",
  "AZURE_SUBSCRIPTION_ID",
  "AZURE_RESOURCE_GROUP",
  "AZURE_LOCATION",
  "AZURE_VNET_NAME",
  "AZURE_ACA_SUBNET_NAME",
  "AZURE_POSTGRES_SUBNET_NAME",
  "AZURE_PRIVATE_DNS_ZONE_NAME",
  "ACA_ENVIRONMENT_NAME",
  "AZURE_LOG_ANALYTICS_WORKSPACE_NAME",
  "ACA_API_APP_NAME",
  "ACA_WEB_APP_NAME",
  "ACA_CODEX_APP_NAME",
  "ACA_MIGRATE_JOB_NAME",
  "ACR_PULL_IDENTITY_NAME",
  "ACR_NAME",
  "POSTGRES_SERVER_NAME",
  "POSTGRES_DATABASE_NAME",
  "POSTGRES_ADMIN_USERNAME",
  "POSTGRES_ADMIN_PASSWORD",
  "API_IDENTIFIER_URI",
  "AUTH_AUDIENCE",
  "AUTH_ALLOWED_CLIENT_IDS",
  "AUTH_ACTIVE_TENANT_IDS",
  "OAUTH_TOKEN_ISSUER",
  "OAUTH_TOKEN_AUDIENCE",
  "OAUTH_TOKEN_SIGNING_SECRET",
  "AUTH_BOOTSTRAP_ALLOWED_TENANT_ID",
  "AUTH_BOOTSTRAP_ALLOWED_APP_CLIENT_ID",
  "AUTH_BOOTSTRAP_DELEGATED_USER_OID",
  "AUTH_BOOTSTRAP_DELEGATED_USER_EMAIL"
];

const PROVIDERS = [
  "Microsoft.App",
  "Microsoft.ContainerService",
  "Microsoft.Network",
  "Microsoft.DBforPostgreSQL",
  "Microsoft.OperationalInsights"
];

async function capture(cmd, args) {
  const { stdout } = await execFileAsync(cmd, args, { encoding: "utf8" });
  return stdout.trim();
}

async function main() {
  for (const envName of REQUIRED_ENV_NAMES) {
    requireEnv(envName);
  }

  for (const namespace of PROVIDERS) {
    const state = await capture("az", [
      "provider",
      "show",
      "--namespace",
      namespace,
      "--query",
      "registrationState",
      "-o",
      "tsv"
    ]);
    if (state !== "Registered") {
      throw new Error(`Provider ${namespace} is not registered (state=${state})`);
    }
  }

  const privateDnsZone = requireEnv("AZURE_PRIVATE_DNS_ZONE_NAME").toLowerCase();
  if (!privateDnsZone.endsWith(".postgres.database.azure.com")) {
    throw new Error("AZURE_PRIVATE_DNS_ZONE_NAME must end with .postgres.database.azure.com");
  }
}

void main();
