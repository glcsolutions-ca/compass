import { pathToFileURL } from "node:url";
import { ensureAzLogin, runAz } from "../../pipeline/shared/scripts/azure/az-command.mjs";
import { loadProductionConfig, loadArmParameters } from "../infra/platform-config.mjs";

async function ensureTxtRecord(resourceGroup, zoneName, recordName, value) {
  await runAz(
    [
      "network",
      "dns",
      "record-set",
      "txt",
      "create",
      "--resource-group",
      resourceGroup,
      "--zone-name",
      zoneName,
      "--name",
      recordName
    ],
    { output: "none" }
  );
  const recordSet = await runAz([
    "network",
    "dns",
    "record-set",
    "txt",
    "show",
    "--resource-group",
    resourceGroup,
    "--zone-name",
    zoneName,
    "--name",
    recordName
  ]);
  const existing = Array.isArray(recordSet?.txtRecords)
    ? recordSet.txtRecords
        .flatMap((entry) => (Array.isArray(entry.value) ? entry.value : []))
        .map((entry) => String(entry || "").trim())
    : [];
  if (existing.includes(value)) {
    return;
  }
  await runAz(
    [
      "network",
      "dns",
      "record-set",
      "txt",
      "add-record",
      "--resource-group",
      resourceGroup,
      "--zone-name",
      zoneName,
      "--record-set-name",
      recordName,
      "--value",
      value
    ],
    { output: "none" }
  );
}

async function ensureARecord(resourceGroup, zoneName, recordName, ipAddress) {
  await runAz(
    [
      "network",
      "dns",
      "record-set",
      "a",
      "create",
      "--resource-group",
      resourceGroup,
      "--zone-name",
      zoneName,
      "--name",
      recordName
    ],
    { output: "none" }
  );
  const recordSet = await runAz([
    "network",
    "dns",
    "record-set",
    "a",
    "show",
    "--resource-group",
    resourceGroup,
    "--zone-name",
    zoneName,
    "--name",
    recordName
  ]);
  const existing = Array.isArray(recordSet?.aRecords)
    ? recordSet.aRecords.map((entry) => String(entry.ipv4Address || "").trim()).filter(Boolean)
    : [];
  if (existing.length === 0) {
    await runAz(
      [
        "network",
        "dns",
        "record-set",
        "a",
        "add-record",
        "--resource-group",
        resourceGroup,
        "--zone-name",
        zoneName,
        "--record-set-name",
        recordName,
        "--ipv4-address",
        ipAddress
      ],
      { output: "none" }
    );
    return;
  }
  if (!existing.includes(ipAddress)) {
    throw new Error(
      `DNS A record ${recordName}.${zoneName} already exists with ${existing.join(", ")}; expected ${ipAddress}`
    );
  }
}

export async function configureWebDomain() {
  await ensureAzLogin();
  const config = await loadProductionConfig();
  const parameters = await loadArmParameters();
  const zoneName = parameters.dnsZoneName;
  const webAppName = config.environmentVars.ACA_WEB_PROD_APP_NAME;
  const verificationId = await runAz(
    [
      "containerapp",
      "show",
      "--resource-group",
      config.resourceGroup,
      "--name",
      webAppName,
      "--query",
      "properties.customDomainVerificationId"
    ],
    { output: "tsv" }
  );
  const staticIp = await runAz(
    [
      "containerapp",
      "env",
      "show",
      "--resource-group",
      config.resourceGroup,
      "--name",
      parameters.environmentName,
      "--query",
      "properties.staticIp"
    ],
    { output: "tsv" }
  );
  const nameservers = await runAz(
    [
      "network",
      "dns",
      "zone",
      "show",
      "--resource-group",
      config.resourceGroup,
      "--name",
      zoneName,
      "--query",
      "nameServers"
    ],
    { output: "json" }
  );

  console.info(`Delegate '${zoneName}' at the parent DNS provider to:`);
  for (const nameserver of nameservers) {
    console.info(`- ${nameserver}`);
  }

  await ensureTxtRecord(config.resourceGroup, zoneName, "asuid", verificationId);
  await ensureARecord(config.resourceGroup, zoneName, "@", staticIp);

  await runAz(
    [
      "containerapp",
      "hostname",
      "bind",
      "--resource-group",
      config.resourceGroup,
      "--name",
      webAppName,
      "--hostname",
      config.webCustomDomain,
      "--environment",
      parameters.environmentName,
      "--validation-method",
      "DNS"
    ],
    { output: "none" }
  );

  console.info(`Configured custom domain for ${config.webCustomDomain}`);
}

export async function main() {
  await configureWebDomain();
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
