import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  parseCliArgs,
  optionalOption,
  requireOption
} from "../../pipeline/shared/scripts/cli-utils.mjs";
import { ensureAzLogin, runAz } from "../../pipeline/shared/scripts/azure/az-command.mjs";
import {
  loadArmParameters,
  loadProductionConfig,
  PRODUCTION_PARAMETER_FILE
} from "./platform-config.mjs";

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
  try {
    return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
  } catch {
    return {};
  }
}

async function buildParameters() {
  const baseParameters = await loadArmParameters(PRODUCTION_PARAMETER_FILE);
  const productionConfig = await loadProductionConfig();
  const templateFile = path.resolve("platform/infra/azure/main.bicep");
  const allowedParameters = await templateParameterNames(templateFile);
  const keyVaultName = String(baseParameters.keyVaultName || "").trim();
  if (!keyVaultName) {
    throw new Error("production parameter file must include keyVaultName");
  }

  const postgresAdminPassword =
    envValue("POSTGRES_ADMIN_PASSWORD") ||
    (await getKeyVaultSecret(keyVaultName, "postgres-admin-password", { required: false }));
  if (!postgresAdminPassword) {
    throw new Error(
      "For the first production foundation apply, export POSTGRES_ADMIN_PASSWORD before running pnpm infra:apply. After foundation exists, pnpm infra:apply reads postgres-admin-password from Key Vault."
    );
  }

  const entraSync = await loadEntraSyncOutput();
  const webClientId = envValue("ENTRA_WEB_CLIENT_ID") || String(entraSync.webClientId || "").trim();
  if (!webClientId) {
    throw new Error(
      "bootstrap/.artifacts/entra-apps.json must exist with webClientId before platform apply"
    );
  }

  const parameters = {
    ...Object.fromEntries(
      Object.entries(baseParameters)
        .filter(([name]) => allowedParameters.has(name))
        .map(([name, value]) => [name, parameterEntry(value)])
    ),
    ...(allowedParameters.has("postgresAdminPassword")
      ? { postgresAdminPassword: parameterEntry(postgresAdminPassword) }
      : {}),
    ...(allowedParameters.has("entraClientId")
      ? { entraClientId: parameterEntry(webClientId) }
      : {}),
    ...(allowedParameters.has("seedDefaultAppClientId")
      ? {
          seedDefaultAppClientId: parameterEntry(
            String(baseParameters.seedDefaultAppClientId || "").trim() || webClientId
          )
        }
      : {})
  };

  return {
    parameters,
    resourceGroup: productionConfig.resourceGroup,
    templateFile
  };
}

async function withParametersFile(parameters, callback) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "compass-platform-"));
  const filePath = path.join(tempDir, "parameters.json");
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
  return callback(filePath);
}

export async function applyPlatform({ mode, resourceGroup }) {
  if (!["what-if", "apply"].includes(mode)) {
    throw new Error(`Unsupported mode '${mode}'`);
  }

  await ensureAzLogin();
  const resolved = await buildParameters();
  const targetResourceGroup = resourceGroup || resolved.resourceGroup;

  return withParametersFile(resolved.parameters, async (parametersFile) => {
    const deploymentName = "compass-platform";
    const result = await runAz([
      "deployment",
      "group",
      mode === "what-if" ? "what-if" : "create",
      "--resource-group",
      targetResourceGroup,
      "--name",
      deploymentName,
      "--template-file",
      resolved.templateFile,
      "--parameters",
      `@${parametersFile}`
    ]);

    return {
      deploymentName,
      resourceGroup: targetResourceGroup,
      templateFile: resolved.templateFile,
      result
    };
  });
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const result = await applyPlatform({
    mode: requireOption(options, "mode"),
    resourceGroup: optionalOption(options, "resource-group")
  });

  console.info(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
