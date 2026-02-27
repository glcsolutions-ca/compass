import path from "node:path";
import { getHeadSha, requireEnv, runJson, writeArtifact } from "./utils.mjs";
import { withCcsGuardrail } from "../../shared/ccs-contract.mjs";

const resourceGroup = requireEnv("AZURE_RESOURCE_GROUP");
const apiAppName = requireEnv("ACA_API_APP_NAME");
const webAppName = requireEnv("ACA_WEB_APP_NAME");
const apiCustomDomain = normalizeDomain(
  requireEnv("ACA_API_CUSTOM_DOMAIN"),
  "ACA_API_CUSTOM_DOMAIN"
);
const webCustomDomain = normalizeDomain(
  requireEnv("ACA_WEB_CUSTOM_DOMAIN"),
  "ACA_WEB_CUSTOM_DOMAIN"
);

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

  const payload = {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    resourceGroup,
    records: [
      ...buildRecords(apiCustomDomain, apiDnsInputs.ingressFqdn, apiDnsInputs.verificationId),
      ...buildRecords(webCustomDomain, webDnsInputs.ingressFqdn, webDnsInputs.verificationId)
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
  return { status: "pass", code: "CUSTOM_DOMAIN_DNS_PLAN" };
}

void withCcsGuardrail({
  guardrailId: "deployment.custom-domain-dns",
  command: "node scripts/pipeline/cloud/deployment-stage/custom-domain-dns.mjs",
  passCode: "CUSTOM_DOMAIN_DNS_PLAN",
  passRef: "docs/runbooks/cloud-deployment-pipeline-setup.md",
  run: main,
  mapError: (error) => ({
    code: "CUSTOM_DOMAIN_DNS_FAIL",
    why: error instanceof Error ? error.message : String(error),
    fix: "Resolve custom domain DNS plan prerequisites and retry.",
    doCommands: ["node scripts/pipeline/cloud/deployment-stage/custom-domain-dns.mjs"],
    ref: "docs/runbooks/cloud-deployment-pipeline-setup.md"
  })
});
