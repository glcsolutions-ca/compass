import { execFile } from "node:child_process";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { getHeadSha, requireEnv, sleep, writeArtifact } from "./utils.mjs";

const execFileAsync = promisify(execFile);

export const TRANSIENT_DEPLOYMENT_ERROR_PATTERN =
  /(OperationExpired|GatewayTimeout|TooManyRequests|ResourceNotReady|another operation is in progress|OperationInProgress|retryable|temporar|timeout|timed out)/i;

function normalizeNumber(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function isoTimestamp(nowFn) {
  return nowFn().toISOString();
}

function parseArmParameterOverrides(raw) {
  const value = String(raw ?? "").trim();
  if (!value) {
    return [];
  }

  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function createArmDeploymentName({
  prefix = "main",
  runId = process.env.GITHUB_RUN_ID,
  runAttempt = process.env.GITHUB_RUN_ATTEMPT
} = {}) {
  const normalizedPrefix = String(prefix || "main").trim() || "main";
  const normalizedRunId = String(runId ?? "").trim();
  const normalizedRunAttempt = String(runAttempt ?? "").trim();

  if (normalizedRunId && normalizedRunAttempt) {
    return `${normalizedPrefix}-${normalizedRunId}-${normalizedRunAttempt}`;
  }

  return `${normalizedPrefix}-local-1`;
}

export function buildDeploymentCommandArgs({
  command,
  resourceGroup,
  deploymentName,
  templateFile,
  parametersFile,
  parameterOverrides = []
}) {
  const normalizedCommand = String(command ?? "").trim();
  const normalizedParametersFile = String(parametersFile ?? "").trim();
  if (normalizedCommand !== "validate" && normalizedCommand !== "create") {
    throw new Error(`Unsupported deployment command: '${normalizedCommand}'`);
  }
  if (!normalizedParametersFile) {
    throw new Error("parametersFile is required");
  }

  const parametersFileArg = normalizedParametersFile.endsWith(".bicepparam")
    ? normalizedParametersFile
    : `@${normalizedParametersFile}`;

  return [
    "deployment",
    "group",
    normalizedCommand,
    "--resource-group",
    resourceGroup,
    "--name",
    deploymentName,
    "--template-file",
    templateFile,
    "--parameters",
    parametersFileArg,
    ...(parameterOverrides.length > 0 ? ["--parameters", ...parameterOverrides] : []),
    ...(normalizedCommand === "create" ? ["--output", "json"] : [])
  ];
}

export function isTransientDeploymentError(stderr) {
  return TRANSIENT_DEPLOYMENT_ERROR_PATTERN.test(String(stderr ?? ""));
}

export async function executeAz(args) {
  try {
    const { stdout, stderr } = await execFileAsync("az", args, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024
    });

    return {
      success: true,
      stdout: stdout ?? "",
      stderr: stderr ?? "",
      code: 0
    };
  } catch (error) {
    return {
      success: false,
      stdout: error?.stdout ? String(error.stdout) : "",
      stderr: error?.stderr
        ? String(error.stderr)
        : error instanceof Error
          ? error.message
          : String(error),
      code: Number.isInteger(error?.code) ? error.code : 1
    };
  }
}

async function appendAttemptLine(attemptsPath, line) {
  await appendFile(attemptsPath, `${line}\n`, "utf8");
}

export async function applyBicepTemplate({
  resourceGroup,
  templateFile,
  parametersFile,
  parameterOverrides = [],
  artifactDir,
  deploymentName,
  maxAttempts = 2,
  retryDelayMs = 20_000,
  runAz = executeAz,
  sleepFn = sleep,
  nowFn = () => new Date()
}) {
  const normalizedResourceGroup = String(resourceGroup ?? "").trim();
  const normalizedTemplateFile = String(templateFile ?? "").trim();
  const normalizedParametersFile = String(parametersFile ?? "").trim();
  const normalizedArtifactDir = String(artifactDir ?? "").trim();
  const normalizedDeploymentName = String(deploymentName ?? "").trim();
  const normalizedParameterOverrides = Array.isArray(parameterOverrides)
    ? parameterOverrides.map((value) => String(value).trim()).filter((value) => value.length > 0)
    : [];
  const normalizedMaxAttempts = normalizeNumber(maxAttempts, 2);
  const normalizedRetryDelayMs = normalizeNumber(retryDelayMs, 20_000);

  if (!normalizedResourceGroup) {
    throw new Error("resourceGroup is required");
  }
  if (!normalizedTemplateFile) {
    throw new Error("templateFile is required");
  }
  if (!normalizedParametersFile) {
    throw new Error("parametersFile is required");
  }
  if (!normalizedArtifactDir) {
    throw new Error("artifactDir is required");
  }
  if (!normalizedDeploymentName) {
    throw new Error("deploymentName is required");
  }
  if (normalizedMaxAttempts < 1) {
    throw new Error("maxAttempts must be >= 1");
  }
  if (normalizedRetryDelayMs < 0) {
    throw new Error("retryDelayMs must be >= 0");
  }

  await mkdir(normalizedArtifactDir, { recursive: true });

  const attemptsPath = path.join(normalizedArtifactDir, "deployment-attempts.log");
  const stderrPath = path.join(normalizedArtifactDir, "deployment.stderr.log");
  const deploymentPath = path.join(normalizedArtifactDir, "deployment.json");
  const metadataPath = path.join(normalizedArtifactDir, "deployment-metadata.json");

  await writeFile(attemptsPath, "", "utf8");
  await writeFile(stderrPath, "", "utf8");

  const validateArgs = buildDeploymentCommandArgs({
    command: "validate",
    resourceGroup: normalizedResourceGroup,
    deploymentName: normalizedDeploymentName,
    templateFile: normalizedTemplateFile,
    parametersFile: normalizedParametersFile,
    parameterOverrides: normalizedParameterOverrides
  });
  const validateResult = await runAz(validateArgs);

  if (!validateResult.success) {
    await writeFile(stderrPath, String(validateResult.stderr ?? ""), "utf8");
    throw new Error(
      [
        "Infra validation failed with terminal diagnostics:",
        String(validateResult.stderr ?? "").trim() || "(no stderr output)"
      ].join("\n")
    );
  }

  for (let attempt = 1; attempt <= normalizedMaxAttempts; attempt += 1) {
    await appendAttemptLine(
      attemptsPath,
      `attempt=${attempt} startedAt=${isoTimestamp(nowFn)} deploymentName=${normalizedDeploymentName}`
    );

    const createArgs = buildDeploymentCommandArgs({
      command: "create",
      resourceGroup: normalizedResourceGroup,
      deploymentName: normalizedDeploymentName,
      templateFile: normalizedTemplateFile,
      parametersFile: normalizedParametersFile,
      parameterOverrides: normalizedParameterOverrides
    });
    const createResult = await runAz(createArgs);

    await writeFile(stderrPath, String(createResult.stderr ?? ""), "utf8");

    if (createResult.success) {
      const deploymentPayload = String(createResult.stdout ?? "").trim() || "{}";
      await writeFile(deploymentPath, `${deploymentPayload}\n`, "utf8");
      await appendAttemptLine(
        attemptsPath,
        `attempt=${attempt} status=success finishedAt=${isoTimestamp(nowFn)}`
      );

      await writeArtifact(metadataPath, {
        schemaVersion: "1",
        generatedAt: isoTimestamp(nowFn),
        resourceGroup: normalizedResourceGroup,
        deploymentName: normalizedDeploymentName,
        templateFile: normalizedTemplateFile,
        parametersFile: normalizedParametersFile,
        maxAttempts: normalizedMaxAttempts,
        attemptsUsed: attempt
      });

      return {
        deploymentName: normalizedDeploymentName,
        attemptsUsed: attempt,
        deploymentPath,
        attemptsPath,
        stderrPath,
        metadataPath
      };
    }

    const transient =
      attempt < normalizedMaxAttempts && isTransientDeploymentError(createResult.stderr);
    await appendAttemptLine(
      attemptsPath,
      `attempt=${attempt} status=${transient ? "retry" : "failed"} transient=${transient} finishedAt=${isoTimestamp(nowFn)}`
    );

    if (transient) {
      console.info(
        `Transient infra apply failure detected for deployment '${normalizedDeploymentName}'; retrying in ${normalizedRetryDelayMs}ms...`
      );
      await sleepFn(normalizedRetryDelayMs);
      continue;
    }

    throw new Error(
      [
        "Infra apply failed with terminal diagnostics:",
        String(createResult.stderr ?? "").trim() || "(no stderr output)"
      ].join("\n")
    );
  }

  throw new Error("Infra apply failed without a terminal result.");
}

async function main() {
  const resourceGroup = requireEnv("AZURE_RESOURCE_GROUP");
  const templateFile = process.env.ARM_TEMPLATE_FILE?.trim() || "infra/azure/main.bicep";
  const parametersFile = requireEnv("ARM_PARAMETERS_FILE");
  const artifactDir =
    process.env.ARM_ARTIFACT_DIR?.trim() || path.join(".artifacts", "infra", getHeadSha());
  const deploymentName =
    process.env.ARM_DEPLOYMENT_NAME?.trim() ||
    createArmDeploymentName({ prefix: process.env.ARM_DEPLOYMENT_NAME_PREFIX?.trim() || "main" });
  const maxAttempts = normalizeNumber(process.env.ARM_MAX_ATTEMPTS, 2);
  const retryDelayMs = normalizeNumber(process.env.ARM_RETRY_DELAY_MS, 20_000);
  const parameterOverrides = parseArmParameterOverrides(process.env.ARM_PARAMETERS_OVERRIDES);

  const result = await applyBicepTemplate({
    resourceGroup,
    templateFile,
    parametersFile,
    parameterOverrides,
    artifactDir,
    deploymentName,
    maxAttempts,
    retryDelayMs
  });

  console.info(
    [
      "Infra deployment succeeded.",
      `Deployment name: ${result.deploymentName}`,
      `Attempts used: ${result.attemptsUsed}`,
      `Artifact dir: ${artifactDir}`
    ].join("\n")
  );
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectExecution) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
