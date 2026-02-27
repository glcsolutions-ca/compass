import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const keyVaultPurgeCommandTimeoutMs = 2 * 60 * 1000;
const keyVaultPurgeWaitTimeoutMs = 10 * 60 * 1000;
const keyVaultPurgePollIntervalMs = 5 * 1000;
const roleNames = {
  contributor: "Contributor",
  userAccessAdministrator: "User Access Administrator",
  keyVaultSecretsUser: "Key Vault Secrets User",
  keyVaultSecretsOfficer: "Key Vault Secrets Officer"
};

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function az(args, options = {}) {
  const { stdout } = await execFileAsync("az", args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 16,
    ...options
  });
  return stdout.trim();
}

async function azJson(args) {
  const output = await az([...args, "--output", "json"]);
  return output ? JSON.parse(output) : {};
}

function readStringParam(source, name) {
  const pattern = new RegExp(`^param\\s+${name}\\s*=\\s*'([^']*)'\\s*$`, "m");
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Could not resolve string parameter '${name}' in cloud.bicepparam`);
  }
  return match[1];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deletedKeyVaultExists(keyVaultName) {
  const deleted = await azJson([
    "keyvault",
    "list-deleted",
    "--query",
    `[?name=='${keyVaultName}']`
  ]);
  return Array.isArray(deleted) && deleted.length > 0;
}

async function purgeDeletedKeyVault({ keyVaultName, location }) {
  console.info(`Deleted Key Vault '${keyVaultName}' found; starting purge.`);
  try {
    await az(
      ["keyvault", "purge", "--name", keyVaultName, "--location", location, "--output", "none"],
      { timeout: keyVaultPurgeCommandTimeoutMs }
    );
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    if (
      message.includes("DeletedVaultNotFound") ||
      message.includes("VaultNotFound") ||
      message.includes("was not found")
    ) {
      return;
    }
    if (message.includes("timed out")) {
      console.info(`Key Vault purge command timed out; waiting for purge completion state.`);
    } else {
      throw error;
    }
  }

  const deadline = Date.now() + keyVaultPurgeWaitTimeoutMs;
  while (Date.now() < deadline) {
    if (!(await deletedKeyVaultExists(keyVaultName))) {
      console.info(`Deleted Key Vault '${keyVaultName}' purge completed.`);
      return;
    }
    await sleep(keyVaultPurgePollIntervalMs);
  }

  throw new Error(
    `Timed out waiting for deleted Key Vault '${keyVaultName}' purge completion after ${keyVaultPurgeWaitTimeoutMs}ms`
  );
}

async function roleAssignmentExists({ assigneeObjectId, scope, roleDefinitionName }) {
  const assignments = await azJson([
    "role",
    "assignment",
    "list",
    "--assignee-object-id",
    assigneeObjectId,
    "--scope",
    scope,
    "--query",
    `[?roleDefinitionName=='${roleDefinitionName}'].id`
  ]);
  return Array.isArray(assignments) && assignments.length > 0;
}

async function ensureRoleAssignment({ assigneeObjectId, scope, roleDefinitionName }) {
  const exists = await roleAssignmentExists({
    assigneeObjectId,
    scope,
    roleDefinitionName
  });
  if (exists) {
    return "exists";
  }

  await az([
    "role",
    "assignment",
    "create",
    "--assignee-object-id",
    assigneeObjectId,
    "--assignee-principal-type",
    "ServicePrincipal",
    "--scope",
    scope,
    "--role",
    roleDefinitionName,
    "--output",
    "none"
  ]);
  return "created";
}

async function ensureUserRoleAssignment({ assigneeObjectId, scope, roleDefinitionName }) {
  const assignments = await azJson([
    "role",
    "assignment",
    "list",
    "--assignee-object-id",
    assigneeObjectId,
    "--scope",
    scope,
    "--query",
    `[?roleDefinitionName=='${roleDefinitionName}'].id`
  ]);
  if (Array.isArray(assignments) && assignments.length > 0) {
    return "exists";
  }

  await az([
    "role",
    "assignment",
    "create",
    "--assignee-object-id",
    assigneeObjectId,
    "--assignee-principal-type",
    "User",
    "--scope",
    scope,
    "--role",
    roleDefinitionName,
    "--output",
    "none"
  ]);
  return "created";
}

async function ensureAcr({ resourceGroup, location, acrName, acrSku }) {
  try {
    const acr = await azJson(["acr", "show", "--name", acrName, "--resource-group", resourceGroup]);
    return { action: "exists", id: acr.id };
  } catch {
    await az([
      "acr",
      "create",
      "--name",
      acrName,
      "--resource-group",
      resourceGroup,
      "--location",
      location,
      "--sku",
      acrSku,
      "--admin-enabled",
      "false",
      "--output",
      "none"
    ]);
    const acr = await azJson(["acr", "show", "--name", acrName, "--resource-group", resourceGroup]);
    return { action: "created", id: acr.id };
  }
}

async function ensureKeyVault({ resourceGroup, location, keyVaultName }) {
  try {
    const keyVault = await azJson([
      "keyvault",
      "show",
      "--name",
      keyVaultName,
      "--resource-group",
      resourceGroup
    ]);
    await az([
      "keyvault",
      "update",
      "--name",
      keyVaultName,
      "--resource-group",
      resourceGroup,
      "--enabled-for-template-deployment",
      "true",
      "--output",
      "none"
    ]);
    return { action: "exists", id: keyVault.id };
  } catch {
    if (await deletedKeyVaultExists(keyVaultName)) {
      await purgeDeletedKeyVault({
        keyVaultName,
        location
      });
    }

    await az([
      "keyvault",
      "create",
      "--name",
      keyVaultName,
      "--resource-group",
      resourceGroup,
      "--location",
      location,
      "--sku",
      "standard",
      "--enable-rbac-authorization",
      "true",
      "--enabled-for-template-deployment",
      "true",
      "--output",
      "none"
    ]);
    const keyVault = await azJson([
      "keyvault",
      "show",
      "--name",
      keyVaultName,
      "--resource-group",
      resourceGroup
    ]);
    return { action: "created", id: keyVault.id };
  }
}

async function main() {
  const subscriptionId = requireEnv("AZURE_SUBSCRIPTION_ID");
  const resourceGroup = requireEnv("AZURE_RESOURCE_GROUP");
  const deployClientId = requireEnv("AZURE_GITHUB_CLIENT_ID");
  const paramsFile =
    process.env.CLOUD_BICEPPARAM_PATH?.trim() || "infra/azure/environments/cloud.bicepparam";
  const overwriteExistingSecrets =
    (process.env.OVERWRITE_EXISTING_SECRETS ?? "false").trim().toLowerCase() === "true";

  const source = await readFile(path.resolve(paramsFile), "utf8");
  const location = readStringParam(source, "location");
  const acrName = readStringParam(source, "acrName");
  const acrSku = readStringParam(source, "acrSku");
  const keyVaultName = readStringParam(source, "keyVaultName");

  await az(["account", "set", "--subscription", subscriptionId, "--output", "none"]);

  await az([
    "group",
    "create",
    "--name",
    resourceGroup,
    "--location",
    location,
    "--output",
    "none"
  ]);

  const deployPrincipalObjectId = await az([
    "ad",
    "sp",
    "show",
    "--id",
    deployClientId,
    "--query",
    "id",
    "--output",
    "tsv"
  ]);
  if (!deployPrincipalObjectId) {
    throw new Error(`Unable to resolve service principal object id for ${deployClientId}`);
  }

  const resourceGroupScope = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}`;
  const contributorAction = await ensureRoleAssignment({
    assigneeObjectId: deployPrincipalObjectId,
    scope: resourceGroupScope,
    roleDefinitionName: roleNames.contributor
  });
  const uaaAction = await ensureRoleAssignment({
    assigneeObjectId: deployPrincipalObjectId,
    scope: resourceGroupScope,
    roleDefinitionName: roleNames.userAccessAdministrator
  });

  const acrResult = await ensureAcr({
    resourceGroup,
    location,
    acrName,
    acrSku
  });

  const keyVaultResult = await ensureKeyVault({
    resourceGroup,
    location,
    keyVaultName
  });

  const keyVaultSecretsUserAction = await ensureRoleAssignment({
    assigneeObjectId: deployPrincipalObjectId,
    scope: keyVaultResult.id,
    roleDefinitionName: roleNames.keyVaultSecretsUser
  });

  let signedInUserRoleAction = "skipped";
  try {
    const signedInUserId = await az([
      "ad",
      "signed-in-user",
      "show",
      "--query",
      "id",
      "--output",
      "tsv"
    ]);
    if (signedInUserId) {
      signedInUserRoleAction = await ensureUserRoleAssignment({
        assigneeObjectId: signedInUserId,
        scope: keyVaultResult.id,
        roleDefinitionName: roleNames.keyVaultSecretsOfficer
      });
    }
  } catch {
    // Non-user auth contexts cannot resolve signed-in user; skip local seeding helper role.
  }

  await execFileAsync("node", ["scripts/infra/seed-keyvault-secrets.mjs"], {
    cwd: path.resolve("."),
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 16,
    env: {
      ...process.env,
      KEY_VAULT_NAME: keyVaultName,
      OVERWRITE_EXISTING: overwriteExistingSecrets ? "true" : "false"
    }
  });

  console.info("Cloud bootstrap complete.");
  console.info(`- resourceGroup: ${resourceGroup}`);
  console.info(`- location: ${location}`);
  console.info(`- acrName: ${acrName} (${acrResult.action})`);
  console.info(`- keyVaultName: ${keyVaultName} (${keyVaultResult.action})`);
  console.info(`- deployPrincipal contributor: ${contributorAction}`);
  console.info(`- deployPrincipal userAccessAdministrator: ${uaaAction}`);
  console.info(`- deployPrincipal keyVaultSecretsUser: ${keyVaultSecretsUserAction}`);
  console.info(`- signedInUser keyVaultSecretsOfficer: ${signedInUserRoleAction}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
