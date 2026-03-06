import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { fetchReleaseCandidate } from "../../pipeline/shared/scripts/fetch-release-candidate.mjs";
import { readJsonFile } from "../../pipeline/shared/scripts/pipeline-contract-lib.mjs";
import { ensureAzLogin, runAz } from "../../pipeline/shared/scripts/azure/az-command.mjs";
import {
  loadArmParameters,
  loadProductionConfig,
  PRODUCTION_PARAMETER_FILE
} from "../infra/platform-config.mjs";

const execFileAsync = promisify(execFile);

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

async function templateParameterNames(templateFile) {
  const { stdout } = await execFileAsync(
    "az",
    ["bicep", "build", "--file", templateFile, "--stdout"],
    {
      env: process.env,
      maxBuffer: 20 * 1024 * 1024
    }
  );
  const document = JSON.parse(String(stdout || "{}"));
  return new Set(Object.keys(document.parameters || {}));
}

async function loadEntraSyncOutput(filePath = "bootstrap/.artifacts/entra-apps.json") {
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
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
  const config = await loadProductionConfig();
  const baseParameters = await loadArmParameters(PRODUCTION_PARAMETER_FILE);
  const entra = await loadEntraSyncOutput();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "compass-bootstrap-candidate-"));
  const manifestPath = path.join(tempDir, "manifest.json");
  const explicitApiImage = envValue("BOOTSTRAP_API_IMAGE");
  const explicitWebImage = envValue("BOOTSTRAP_WEB_IMAGE");
  const explicitMigrationsImage = envValue("BOOTSTRAP_MIGRATIONS_IMAGE");
  const useExplicitImages = Boolean(
    explicitApiImage && explicitWebImage && explicitMigrationsImage
  );

  try {
    const manifest = useExplicitImages
      ? {
          artifacts: {
            apiImage: explicitApiImage,
            webImage: explicitWebImage,
            migrationsArtifact: explicitMigrationsImage
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
    const vaultName = String(baseParameters.keyVaultName || "").trim();
    const postgresAdminPassword =
      envValue("POSTGRES_ADMIN_PASSWORD") ||
      (await getKeyVaultSecret(vaultName, "postgres-admin-password", { required: true }));

    const templateFile = path.resolve("infra/azure/apps-bootstrap.bicep");
    const allowedParameters = await templateParameterNames(templateFile);

    const parameters = {
      ...Object.fromEntries(
        Object.entries(baseParameters)
          .filter(([name]) => allowedParameters.has(name))
          .map(([name, value]) => [name, parameterEntry(value)])
      ),
      postgresAdminPassword: parameterEntry(postgresAdminPassword),
      entraClientId: parameterEntry(
        envValue("ENTRA_WEB_CLIENT_ID") || String(entra.webClientId || "").trim()
      ),
      seedDefaultAppClientId: parameterEntry(
        String(baseParameters.seedDefaultAppClientId || "").trim() ||
          envValue("ENTRA_WEB_CLIENT_ID") ||
          String(entra.webClientId || "").trim()
      ),
      apiProdImage: parameterEntry(manifest.artifacts.apiImage),
      webProdImage: parameterEntry(manifest.artifacts.webImage),
      apiStageImage: parameterEntry(manifest.artifacts.apiImage),
      webStageImage: parameterEntry(manifest.artifacts.webImage),
      migrationsImage: parameterEntry(manifest.artifacts.migrationsArtifact)
    };

    return withParametersFile(parameters, async (parametersFile) => {
      const result = await runAz([
        "deployment",
        "group",
        "create",
        "--resource-group",
        config.resourceGroup,
        "--name",
        "compass-apps-bootstrap",
        "--template-file",
        templateFile,
        "--parameters",
        `@${parametersFile}`
      ]);

      return {
        resourceGroup: config.resourceGroup,
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
    envValue("BOOTSTRAP_API_IMAGE") &&
    envValue("BOOTSTRAP_WEB_IMAGE") &&
    envValue("BOOTSTRAP_MIGRATIONS_IMAGE")
  );
  if (!candidateId && !hasExplicitImages) {
    throw new Error(
      "--candidate-id is required unless BOOTSTRAP_API_IMAGE, BOOTSTRAP_WEB_IMAGE, and BOOTSTRAP_MIGRATIONS_IMAGE are all set"
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
