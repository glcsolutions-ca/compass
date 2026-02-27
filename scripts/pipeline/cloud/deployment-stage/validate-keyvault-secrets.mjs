import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { appendGithubOutput, requireEnv, writeJsonFile } from "../../shared/pipeline-utils.mjs";
import { withCcsGuardrail } from "../../shared/ccs-contract.mjs";

const execFileAsync = promisify(execFile);
const DEFAULT_REQUIRED_SECRET_NAMES = [
  "postgres-admin-password",
  "web-session-secret",
  "entra-client-secret",
  "auth-oidc-state-encryption-key",
  "oauth-token-signing-secret",
  "openai-api-key"
];

function parseSecretNames(raw) {
  const value = String(raw ?? "").trim();
  if (!value) {
    return [...DEFAULT_REQUIRED_SECRET_NAMES];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function getHeadSha() {
  return process.env.HEAD_SHA?.trim() || process.env.GITHUB_SHA?.trim() || "local";
}

async function checkSecretExists(vaultName, secretName) {
  try {
    await execFileAsync(
      "az",
      [
        "keyvault",
        "secret",
        "show",
        "--vault-name",
        vaultName,
        "--name",
        secretName,
        "--query",
        "id",
        "--output",
        "tsv"
      ],
      {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 4
      }
    );

    return { exists: true, error: null };
  } catch (error) {
    const stderr = String(error?.stderr ?? error?.message ?? "").trim();
    return { exists: false, error: stderr || "Unknown error" };
  }
}

async function main() {
  const keyVaultName = requireEnv("KEY_VAULT_NAME");
  const secretNames = parseSecretNames(process.env.KV_REQUIRED_SECRET_NAMES);
  const startedAt = Date.now();

  const checks = [];
  for (const secretName of secretNames) {
    const result = await checkSecretExists(keyVaultName, secretName);
    checks.push({
      name: secretName,
      exists: result.exists,
      error: result.error
    });
  }

  const missing = checks.filter((entry) => !entry.exists).map((entry) => entry.name);
  const status = missing.length === 0 ? "pass" : "fail";
  const headSha = getHeadSha();

  const artifactPath = path.join(
    ".artifacts",
    "infra",
    headSha,
    "keyvault-secrets-validation.json"
  );

  await writeJsonFile(artifactPath, {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    status,
    keyVaultName,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    requiredSecretNames: secretNames,
    missingSecretNames: missing,
    checks
  });

  await appendGithubOutput({
    keyvault_secret_validation_status: status,
    keyvault_secret_validation_path: artifactPath
  });

  if (status !== "pass") {
    throw new Error(`Missing required Key Vault secrets in ${keyVaultName}: ${missing.join(", ")}`);
  }

  return { status: "pass", code: "KEYVAULT_SECRETS_PASS" };
}

void withCcsGuardrail({
  guardrailId: "deployment.keyvault-secrets-validate",
  command: "node scripts/pipeline/cloud/deployment-stage/validate-keyvault-secrets.mjs",
  passCode: "KEYVAULT_SECRETS_PASS",
  passRef: "docs/runbooks/cloud-deployment-pipeline-setup.md",
  run: main,
  mapError: (error) => ({
    code: "KEYVAULT_SECRETS_FAIL",
    why: error instanceof Error ? error.message : String(error),
    fix: "Ensure all required Key Vault secrets exist before deployment.",
    doCommands: ["node scripts/pipeline/cloud/deployment-stage/validate-keyvault-secrets.mjs"],
    ref: "docs/runbooks/cloud-deployment-pipeline-setup.md"
  })
});
