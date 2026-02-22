import { requireEnv, run, runJson } from "../deploy/utils.mjs";

const resourceGroup = requireEnv("AZURE_RESOURCE_GROUP");
const ghcrServer = normalizeServer(process.env.GHCR_SERVER || "ghcr.io");
const appNames = [
  process.env.ACA_API_APP_NAME?.trim(),
  process.env.ACA_WEB_APP_NAME?.trim()
].filter(Boolean);
const jobNames = [process.env.ACA_MIGRATE_JOB_NAME?.trim()].filter(Boolean);

function normalizeServer(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

function getRegistryServer(entry) {
  return normalizeServer(entry?.server || entry?.registryServer || "");
}

function getPasswordSecretRef(entry) {
  const value = entry?.passwordSecretRef ?? entry?.password_secret_ref ?? "";
  return typeof value === "string" ? value.trim() : "";
}

function isMissingResourceError(error) {
  return /not found|could not be found|ResourceNotFound/i.test(String(error));
}

async function containerAppExists(name) {
  try {
    await run("az", [
      "containerapp",
      "show",
      "--resource-group",
      resourceGroup,
      "--name",
      name,
      "--output",
      "none"
    ]);
    return true;
  } catch (error) {
    if (isMissingResourceError(error)) {
      return false;
    }
    throw error;
  }
}

async function containerAppJobExists(name) {
  try {
    await run("az", [
      "containerapp",
      "job",
      "show",
      "--resource-group",
      resourceGroup,
      "--name",
      name,
      "--output",
      "none"
    ]);
    return true;
  } catch (error) {
    if (isMissingResourceError(error)) {
      return false;
    }
    throw error;
  }
}

function emptyPasswordSecretRefGhcrRegistries(entries) {
  const servers = entries
    .filter((entry) => getRegistryServer(entry) === ghcrServer)
    .filter((entry) => getPasswordSecretRef(entry).length === 0)
    .map(getRegistryServer);

  return [...new Set(servers)];
}

async function sanitizeContainerApp(name) {
  if (!(await containerAppExists(name))) {
    console.info(`Skipping registry sanitize for container app '${name}' (not found)`);
    return 0;
  }

  const registries = await runJson("az", [
    "containerapp",
    "registry",
    "list",
    "--resource-group",
    resourceGroup,
    "--name",
    name,
    "--output",
    "json"
  ]);

  const serversToRemove = emptyPasswordSecretRefGhcrRegistries(
    Array.isArray(registries) ? registries : []
  );

  for (const server of serversToRemove) {
    await run("az", [
      "containerapp",
      "registry",
      "remove",
      "--resource-group",
      resourceGroup,
      "--name",
      name,
      "--server",
      server,
      "--output",
      "none"
    ]);
    console.info(`Removed invalid registry config from container app '${name}': ${server}`);
  }

  return serversToRemove.length;
}

async function sanitizeContainerAppJob(name) {
  if (!(await containerAppJobExists(name))) {
    console.info(`Skipping registry sanitize for container app job '${name}' (not found)`);
    return 0;
  }

  const registries = await runJson("az", [
    "containerapp",
    "job",
    "registry",
    "list",
    "--resource-group",
    resourceGroup,
    "--name",
    name,
    "--output",
    "json"
  ]);

  const serversToRemove = emptyPasswordSecretRefGhcrRegistries(
    Array.isArray(registries) ? registries : []
  );

  for (const server of serversToRemove) {
    await run("az", [
      "containerapp",
      "job",
      "registry",
      "remove",
      "--resource-group",
      resourceGroup,
      "--name",
      name,
      "--server",
      server,
      "--output",
      "none"
    ]);
    console.info(`Removed invalid registry config from container app job '${name}': ${server}`);
  }

  return serversToRemove.length;
}

async function main() {
  if (appNames.length === 0 && jobNames.length === 0) {
    console.info("No container app or job names configured; skipping GHCR registry sanitize.");
    return;
  }

  let removals = 0;
  for (const appName of appNames) {
    removals += await sanitizeContainerApp(appName);
  }

  for (const jobName of jobNames) {
    removals += await sanitizeContainerAppJob(jobName);
  }

  console.info(
    removals > 0
      ? `Sanitized ${removals} invalid GHCR registry entr${removals === 1 ? "y" : "ies"}.`
      : "No invalid GHCR registry entries were found."
  );
}

void main();
