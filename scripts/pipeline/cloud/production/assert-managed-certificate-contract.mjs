import path from "node:path";
import { appendGithubOutput, getHeadSha, requireEnv, runJson, writeArtifact } from "./utils.mjs";
import {
  evaluateManagedCertificateContract,
  extractManagedCertificateEntries
} from "./managed-certificate-contract.mjs";

async function main() {
  const resourceGroup = requireEnv("AZURE_RESOURCE_GROUP");
  const environmentName = requireEnv("ACA_ENVIRONMENT_NAME");

  const apiCustomDomain = process.env.ACA_API_CUSTOM_DOMAIN?.trim() || "";
  const webCustomDomain = process.env.ACA_WEB_CUSTOM_DOMAIN?.trim() || "";
  const codexCustomDomain = process.env.ACA_CODEX_CUSTOM_DOMAIN?.trim() || "";
  const apiManagedCertificateName = process.env.ACA_API_MANAGED_CERTIFICATE_NAME?.trim() || "";
  const webManagedCertificateName = process.env.ACA_WEB_MANAGED_CERTIFICATE_NAME?.trim() || "";
  const codexManagedCertificateName = process.env.ACA_CODEX_MANAGED_CERTIFICATE_NAME?.trim() || "";

  const rawCertificates =
    (await runJson("az", [
      "containerapp",
      "env",
      "certificate",
      "list",
      "--resource-group",
      resourceGroup,
      "--name",
      environmentName,
      "--managed-certificates-only",
      "--output",
      "json"
    ])) ?? [];

  const managedCertificates = extractManagedCertificateEntries(rawCertificates);

  const apiResult = evaluateManagedCertificateContract({
    scopeLabel: "API",
    customDomain: apiCustomDomain,
    customDomainEnvVar: "ACA_API_CUSTOM_DOMAIN",
    managedCertificateName: apiManagedCertificateName,
    managedCertificateEnvVar: "ACA_API_MANAGED_CERTIFICATE_NAME",
    managedCertificates
  });

  const webResult = evaluateManagedCertificateContract({
    scopeLabel: "WEB",
    customDomain: webCustomDomain,
    customDomainEnvVar: "ACA_WEB_CUSTOM_DOMAIN",
    managedCertificateName: webManagedCertificateName,
    managedCertificateEnvVar: "ACA_WEB_MANAGED_CERTIFICATE_NAME",
    managedCertificates
  });

  const codexResult = evaluateManagedCertificateContract({
    scopeLabel: "CODEX",
    customDomain: codexCustomDomain,
    customDomainEnvVar: "ACA_CODEX_CUSTOM_DOMAIN",
    managedCertificateName: codexManagedCertificateName,
    managedCertificateEnvVar: "ACA_CODEX_MANAGED_CERTIFICATE_NAME",
    managedCertificates
  });

  const payload = {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    resourceGroup,
    environmentName,
    managedCertificates: managedCertificates.map((certificate) => ({
      name: certificate.name,
      subjectName: certificate.subjectName
    })),
    api: {
      customDomain: apiResult.customDomain,
      managedCertificateName: apiResult.managedCertificateName,
      mode: apiResult.mode
    },
    web: {
      customDomain: webResult.customDomain,
      managedCertificateName: webResult.managedCertificateName,
      mode: webResult.mode
    },
    codex: {
      customDomain: codexResult.customDomain,
      managedCertificateName: codexResult.managedCertificateName,
      mode: codexResult.mode
    }
  };

  const artifactPath = path.join(
    ".artifacts",
    "infra",
    getHeadSha(),
    "managed-certificate-contract.json"
  );
  await writeArtifact(artifactPath, payload);

  await appendGithubOutput({
    api_managed_certificate_name: apiResult.managedCertificateName,
    web_managed_certificate_name: webResult.managedCertificateName,
    codex_managed_certificate_name: codexResult.managedCertificateName,
    managed_certificate_contract_path: artifactPath
  });

  console.info(
    [
      "Managed certificate contract validated.",
      `API: mode=${apiResult.mode} cert=${apiResult.managedCertificateName || "(none)"}`,
      `WEB: mode=${webResult.mode} cert=${webResult.managedCertificateName || "(none)"}`,
      `CODEX: mode=${codexResult.mode} cert=${codexResult.managedCertificateName || "(none)"}`,
      `Artifact: ${artifactPath}`
    ].join("\n")
  );
}

void main();
