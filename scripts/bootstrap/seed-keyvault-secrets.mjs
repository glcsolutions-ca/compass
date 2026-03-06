import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { runAz } from "../../pipeline/shared/scripts/azure/az-command.mjs";
import { loadArmParameters, loadProductionConfig } from "../infra/platform-config.mjs";

const SECRET_CONTRACT = [
  {
    name: "postgres-admin-password",
    env: "POSTGRES_ADMIN_PASSWORD",
    generator: () => randomBytes(24).toString("base64url")
  },
  {
    name: "entra-client-secret",
    env: "ENTRA_CLIENT_SECRET"
  },
  {
    name: "auth-oidc-state-encryption-key",
    env: "AUTH_OIDC_STATE_ENCRYPTION_KEY",
    generator: () => randomBytes(32).toString("base64url")
  }
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readEntraArtifact() {
  try {
    return JSON.parse(await readFile("bootstrap/.artifacts/entra-apps.json", "utf8"));
  } catch {
    return {};
  }
}

async function resolveSeedPrincipalObjectId() {
  const explicit = process.env.KEY_VAULT_SEED_PRINCIPAL_OBJECT_ID?.trim();
  if (explicit) {
    return explicit;
  }
  return runAz(["ad", "signed-in-user", "show", "--query", "id"], { output: "tsv" });
}

async function ensureKeyVaultSecretsOfficer(vaultName, principalObjectId) {
  const scope = await runAz(["keyvault", "show", "--name", vaultName, "--query", "id"], {
    output: "tsv"
  });
  const existing = await runAz(
    [
      "role",
      "assignment",
      "list",
      "--scope",
      scope,
      "--assignee-object-id",
      principalObjectId,
      "--query",
      "[?roleDefinitionName=='Key Vault Secrets Officer']"
    ],
    { output: "json" }
  );
  if (Array.isArray(existing) && existing.length > 0) {
    return;
  }
  await runAz(
    [
      "role",
      "assignment",
      "create",
      "--scope",
      scope,
      "--assignee-object-id",
      principalObjectId,
      "--assignee-principal-type",
      "User",
      "--role",
      "Key Vault Secrets Officer"
    ],
    { output: "none" }
  );
}

async function secretExists(vaultName, secretName) {
  try {
    await runAz(["keyvault", "secret", "show", "--vault-name", vaultName, "--name", secretName], {
      output: "none"
    });
    return true;
  } catch {
    return false;
  }
}

function resolveSecretValue(contract, entraArtifact) {
  const fromEnv = process.env[contract.env]?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  if (contract.name === "entra-client-secret") {
    const fromArtifact = String(entraArtifact.webClientSecret || "").trim();
    if (fromArtifact) {
      return fromArtifact;
    }
    throw new Error(
      "ENTRA_CLIENT_SECRET must be provided or generated first via scripts/bootstrap/ensure-entra-apps.mjs --reset-web-client-secret"
    );
  }
  return contract.generator();
}

export async function seedKeyVaultSecrets() {
  const config = await loadProductionConfig();
  const parameters = await loadArmParameters();
  const vaultName =
    process.env.KEY_VAULT_NAME?.trim() || String(parameters.keyVaultName || "").trim();
  const overwrite = ["1", "true", "yes", "on"].includes(
    String(process.env.OVERWRITE_EXISTING || "false")
      .trim()
      .toLowerCase()
  );
  const principalObjectId = await resolveSeedPrincipalObjectId();
  const entraArtifact = await readEntraArtifact();

  if (!vaultName) {
    throw new Error(
      "keyVaultName must be configured in production parameters or KEY_VAULT_NAME must be set"
    );
  }

  await ensureKeyVaultSecretsOfficer(vaultName, principalObjectId);
  await sleep(10000);

  for (const contract of SECRET_CONTRACT) {
    if (!overwrite && (await secretExists(vaultName, contract.name))) {
      console.info(`${contract.name}: skipped-existing`);
      continue;
    }
    const value = resolveSecretValue(contract, entraArtifact);
    await runAz(
      [
        "keyvault",
        "secret",
        "set",
        "--vault-name",
        vaultName,
        "--name",
        contract.name,
        `--value=${value}`
      ],
      { output: "none" }
    );
    console.info(
      `${contract.name}: ${overwrite ? "upserted" : "created"} (${config.resourceGroup})`
    );
  }
}

export async function main() {
  await seedKeyVaultSecrets();
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
