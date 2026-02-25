import path from "node:path";
import { getHeadSha, requireEnv, runJson, writeArtifact } from "./utils.mjs";

const resourceGroup = requireEnv("AZURE_RESOURCE_GROUP");
const apiAppName = requireEnv("ACA_API_APP_NAME");
const webAppName = requireEnv("ACA_WEB_APP_NAME");
const codexAppName = process.env.ACA_CODEX_APP_NAME?.trim() || "";
const apiCustomDomain = normalizeDomain(
  requireEnv("ACA_API_CUSTOM_DOMAIN"),
  "ACA_API_CUSTOM_DOMAIN"
);
const webCustomDomain = normalizeDomain(
  requireEnv("ACA_WEB_CUSTOM_DOMAIN"),
  "ACA_WEB_CUSTOM_DOMAIN"
);
const codexCustomDomain = process.env.ACA_CODEX_CUSTOM_DOMAIN?.trim()
  ? normalizeDomain(process.env.ACA_CODEX_CUSTOM_DOMAIN, "ACA_CODEX_CUSTOM_DOMAIN")
  : "";

function normalizeDomain(value, variableName) {
  const normalized = value.trim().toLowerCase().replace(/\.$/, "");
  if (!normalized.includes(".") || !/^[a-z0-9.-]+$/.test(normalized)) {
    throw new Error(`Invalid domain in ${variableName}: ${value}`);
  }
  return normalized;
}

function normalizeHostname(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
}

async function readContainerAppDnsInputs(containerAppName) {
  const app = await runJson("az", [
    "containerapp",
    "show",
    "--resource-group",
    resourceGroup,
    "--name",
    containerAppName,
    "--output",
    "json"
  ]);

  const ingressFqdn = normalizeHostname(app?.properties?.configuration?.ingress?.fqdn);
  const verificationId = String(app?.properties?.customDomainVerificationId || "").trim();

  if (!ingressFqdn) {
    throw new Error(`Container App ${containerAppName} is missing ingress FQDN.`);
  }

  if (!verificationId) {
    throw new Error(`Container App ${containerAppName} is missing customDomainVerificationId.`);
  }

  return {
    ingressFqdn,
    verificationId
  };
}

function buildRecords(domainName, ingressFqdn, verificationId) {
  return [
    {
      type: "CNAME",
      name: domainName,
      value: ingressFqdn,
      ttlSeconds: 300
    },
    {
      type: "TXT",
      name: `asuid.${domainName}`,
      value: verificationId,
      ttlSeconds: 300
    }
  ];
}

async function main() {
  const apiDnsInputs = await readContainerAppDnsInputs(apiAppName);
  const webDnsInputs = await readContainerAppDnsInputs(webAppName);
  const codexDnsInputs =
    codexCustomDomain.length > 0
      ? await readContainerAppDnsInputs(requireCodexAppName(codexAppName))
      : null;

  const payload = {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    resourceGroup,
    records: [
      ...buildRecords(apiCustomDomain, apiDnsInputs.ingressFqdn, apiDnsInputs.verificationId),
      ...buildRecords(webCustomDomain, webDnsInputs.ingressFqdn, webDnsInputs.verificationId),
      ...(codexDnsInputs
        ? buildRecords(codexCustomDomain, codexDnsInputs.ingressFqdn, codexDnsInputs.verificationId)
        : [])
    ]
  };

  const artifactPath = path.join(
    ".artifacts",
    "infra",
    getHeadSha(),
    "custom-domain-dns-records.json"
  );
  await writeArtifact(artifactPath, payload);

  console.info("Add the following DNS records, then run Infra Apply:");
  for (const record of payload.records) {
    console.info(`${record.type} ${record.name} -> ${record.value} (TTL ${record.ttlSeconds})`);
  }
  console.info(`Wrote DNS plan: ${artifactPath}`);
}

void main();

function requireCodexAppName(value) {
  if (!value || value.trim().length === 0) {
    throw new Error("ACA_CODEX_APP_NAME is required when ACA_CODEX_CUSTOM_DOMAIN is configured.");
  }
  return value.trim();
}
