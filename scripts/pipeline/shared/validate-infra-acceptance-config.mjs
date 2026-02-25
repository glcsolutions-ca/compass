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
  "ACA_WORKER_APP_NAME",
  "WORKER_RUNTIME_IDENTITY_NAME",
  "ACA_CODEX_APP_NAME",
  "ACA_MIGRATE_JOB_NAME",
  "WEB_SESSION_SECRET",
  "ENTRA_LOGIN_ENABLED",
  "AUTH_DEV_FALLBACK_ENABLED",
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
  "AUTH_BOOTSTRAP_DELEGATED_USER_EMAIL",
  "SERVICE_BUS_PROD_NAMESPACE_NAME",
  "SERVICE_BUS_ACCEPTANCE_NAMESPACE_NAME",
  "SERVICE_BUS_QUEUE_NAME"
];

const PROVIDERS = [
  "Microsoft.App",
  "Microsoft.ContainerService",
  "Microsoft.Network",
  "Microsoft.DBforPostgreSQL",
  "Microsoft.OperationalInsights",
  "Microsoft.ServiceBus"
];

async function capture(cmd, args) {
  const { stdout } = await execFileAsync(cmd, args, { encoding: "utf8" });
  return stdout.trim();
}

function readBooleanFlag(name) {
  const value = requireEnv(name).toLowerCase();
  if (value !== "true" && value !== "false") {
    throw new Error(`${name} must be 'true' or 'false'`);
  }

  return value === "true";
}

function validateCustomDomain(name, value) {
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    throw new Error(`${name} is required when ENTRA login is enabled`);
  }

  if (
    normalized.includes("://") ||
    normalized.includes("/") ||
    normalized.includes("?") ||
    normalized.includes("#")
  ) {
    throw new Error(`${name} must be a bare domain name (no scheme, path, query, or fragment)`);
  }

  let parsed;
  try {
    parsed = new URL(`https://${normalized}`);
  } catch {
    throw new Error(`${name} must be a valid domain name`);
  }

  if (parsed.hostname !== normalized) {
    throw new Error(`${name} must be a valid domain name`);
  }

  if (
    parsed.hostname === "0.0.0.0" ||
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1"
  ) {
    throw new Error(`${name} must be a routable domain in cloud deployment`);
  }
}

async function main() {
  for (const envName of REQUIRED_ENV_NAMES) {
    requireEnv(envName);
  }

  const entraLoginEnabled = readBooleanFlag("ENTRA_LOGIN_ENABLED");
  const authDevFallbackEnabled = readBooleanFlag("AUTH_DEV_FALLBACK_ENABLED");
  if (authDevFallbackEnabled) {
    throw new Error("AUTH_DEV_FALLBACK_ENABLED must be false for cloud deployment");
  }

  if (entraLoginEnabled) {
    requireEnv("ENTRA_CLIENT_ID");
    requireEnv("ENTRA_CLIENT_SECRET");
    validateCustomDomain("ACA_WEB_CUSTOM_DOMAIN", requireEnv("ACA_WEB_CUSTOM_DOMAIN"));
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
