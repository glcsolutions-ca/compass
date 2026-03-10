import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fetchReleaseCandidate } from "../../pipeline/shared/scripts/fetch-release-candidate.mjs";
import { readJsonFile } from "../../pipeline/shared/scripts/pipeline-contract-lib.mjs";
import { ensureAzLogin, runAz } from "../../pipeline/shared/scripts/azure/az-command.mjs";
import {
  BOOTSTRAP_APPS_VARIABLE_NAMES,
  buildAppsBootstrapParameters,
  loadLivePlatformConfig
} from "../../config/live-config.mjs";

function envValue(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function parameterEntry(value) {
  return { value };
}

async function getKeyVaultSecret(vaultName, secretName, { required = true } = {}) {
  try {
    return await runAz(
      [
        "keyvault",
        "secret",
        "show",
        "--vault-name",
        vaultName,
        "--name",
        secretName,
        "--query",
        "value"
      ],
      { output: "tsv" }
    );
  } catch (error) {
    if (!required) {
      return "";
    }
    throw error;
  }
}

async function withParametersFile(parameters, callback) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "compass-bootstrap-apps-"));
  const filePath = path.join(tempDir, "parameters.json");
  try {
    await writeFile(
      filePath,
      JSON.stringify(
        {
          $schema:
            "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
          contentVersion: "1.0.0.0",
          parameters
        },
        null,
        2
      ),
      "utf8"
    );
    return await callback(filePath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function bootstrapProductionApps({ candidateId }) {
  await ensureAzLogin();
  const config = await loadLivePlatformConfig({
    requiredVariableNames: BOOTSTRAP_APPS_VARIABLE_NAMES
  });
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "compass-bootstrap-candidate-"));
  const manifestPath = path.join(tempDir, "manifest.json");
  const explicitApiImage = envValue("BOOTSTRAP_API_IMAGE");
  const explicitWebImage = envValue("BOOTSTRAP_WEB_IMAGE");
  const useExplicitImages = Boolean(explicitApiImage && explicitWebImage);

  try {
    const manifest = useExplicitImages
      ? {
          artifacts: {
            apiImage: explicitApiImage,
            webImage: explicitWebImage
          }
        }
      : await (async () => {
          await fetchReleaseCandidate(
            candidateId,
            manifestPath,
            "ghcr.io/glcsolutions-ca/compass-release-manifests"
          );
          return readJsonFile(manifestPath);
        })();

    const postgresAdminPassword =
      envValue("POSTGRES_ADMIN_PASSWORD") ||
      (await getKeyVaultSecret(config.azureKeyVaultName, "postgres-admin-password", {
        required: true
      }));

    const templateFile = path.resolve("platform/infra/azure/apps-bootstrap.bicep");
    const parameters = Object.fromEntries(
      Object.entries(
        buildAppsBootstrapParameters(config, {
          postgresAdminPassword,
          apiProdImage: manifest.artifacts.apiImage,
          webProdImage: manifest.artifacts.webImage
        })
      ).map(([name, value]) => [name, parameterEntry(value)])
    );

    return withParametersFile(parameters, async (parametersFile) => {
      const result = await runAz([
        "deployment",
        "group",
        "create",
        "--resource-group",
        config.azureResourceGroup,
        "--name",
        "compass-apps-bootstrap",
        "--template-file",
        templateFile,
        "--parameters",
        `@${parametersFile}`
      ]);

      return {
        resourceGroup: config.azureResourceGroup,
        candidateId,
        stageWebFqdn: result?.properties?.outputs?.stageWebFqdn?.value || "",
        result
      };
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function main(argv = process.argv.slice(2)) {
  const candidateIdIndex = argv.indexOf("--candidate-id");
  const candidateId = candidateIdIndex >= 0 ? String(argv[candidateIdIndex + 1] || "").trim() : "";
  const hasExplicitImages = Boolean(
    envValue("BOOTSTRAP_API_IMAGE") && envValue("BOOTSTRAP_WEB_IMAGE")
  );
  if (!candidateId && !hasExplicitImages) {
    throw new Error(
      "--candidate-id is required unless BOOTSTRAP_API_IMAGE and BOOTSTRAP_WEB_IMAGE are both set"
    );
  }
  const result = await bootstrapProductionApps({ candidateId });
  console.info(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
