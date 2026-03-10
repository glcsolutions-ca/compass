import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  parseCliArgs,
  optionalOption,
  requireOption
} from "../../pipeline/shared/scripts/cli-utils.mjs";
import {
  ensureAzLogin,
  runAz,
  runAzText
} from "../../pipeline/shared/scripts/azure/az-command.mjs";
import {
  INFRA_VARIABLE_NAMES,
  buildMainTemplateParameters,
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

async function buildParameters() {
  const config = await loadLivePlatformConfig({
    requiredVariableNames: INFRA_VARIABLE_NAMES
  });
  const templateFile = path.resolve("platform/infra/azure/main.bicep");
  const postgresAdminPassword =
    envValue("POSTGRES_ADMIN_PASSWORD") ||
    (await getKeyVaultSecret(config.azureKeyVaultName, "postgres-admin-password", {
      required: false
    }));

  if (!postgresAdminPassword) {
    throw new Error(
      "For the first foundation apply, export POSTGRES_ADMIN_PASSWORD before running pnpm infra:apply. After the foundation exists, pnpm infra:apply reads postgres-admin-password from Key Vault."
    );
  }

  const parameters = Object.fromEntries(
    Object.entries(buildMainTemplateParameters(config, { postgresAdminPassword })).map(
      ([name, value]) => [name, parameterEntry(value)]
    )
  );

  return {
    parameters,
    resourceGroup: config.azureResourceGroup,
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
    const baseArgs = [
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
    ];
    const result =
      mode === "what-if"
        ? await runAzText(baseArgs)
        : await runAz(baseArgs);

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
