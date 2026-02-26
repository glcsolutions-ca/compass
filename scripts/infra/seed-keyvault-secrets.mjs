import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SECRET_ENV_MAP = [
  { name: "postgres-admin-password", env: "POSTGRES_ADMIN_PASSWORD" },
  { name: "web-session-secret", env: "WEB_SESSION_SECRET" },
  { name: "entra-client-secret", env: "ENTRA_CLIENT_SECRET" },
  {
    name: "auth-oidc-state-encryption-key",
    env: "AUTH_OIDC_STATE_ENCRYPTION_KEY"
  },
  { name: "oauth-token-signing-secret", env: "OAUTH_TOKEN_SIGNING_SECRET" }
];

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function generateDefaultSecretValue(secretName) {
  switch (secretName) {
    case "postgres-admin-password":
      return randomBytes(24).toString("base64url");
    case "web-session-secret":
      return randomBytes(48).toString("base64url");
    case "auth-oidc-state-encryption-key":
      return randomBytes(32).toString("base64url");
    case "oauth-token-signing-secret":
      return randomBytes(48).toString("base64url");
    case "entra-client-secret":
      return "set-me";
    default:
      return randomBytes(32).toString("base64url");
  }
}

async function setSecret({ keyVaultName, secretName, secretValue }) {
  await execFileAsync(
    "az",
    [
      "keyvault",
      "secret",
      "set",
      "--vault-name",
      keyVaultName,
      "--name",
      secretName,
      `--value=${secretValue}`,
      "--output",
      "none"
    ],
    {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 4
    }
  );
}

async function main() {
  const keyVaultName = requireEnv("KEY_VAULT_NAME");
  const overwrite = (process.env.OVERWRITE_EXISTING ?? "false").trim().toLowerCase() === "true";

  const seeded = [];

  for (const contract of SECRET_ENV_MAP) {
    const fromEnv = process.env[contract.env]?.trim();
    const secretValue =
      fromEnv && fromEnv.length > 0 ? fromEnv : generateDefaultSecretValue(contract.name);

    if (!overwrite) {
      try {
        await execFileAsync(
          "az",
          [
            "keyvault",
            "secret",
            "show",
            "--vault-name",
            keyVaultName,
            "--name",
            contract.name,
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
        seeded.push({ name: contract.name, action: "skipped-existing" });
        continue;
      } catch {
        // Secret does not exist yet.
      }
    }

    await setSecret({
      keyVaultName,
      secretName: contract.name,
      secretValue
    });

    seeded.push({ name: contract.name, action: overwrite ? "upserted" : "created" });
  }

  console.info(`Seeded Key Vault secrets for ${keyVaultName}:`);
  for (const entry of seeded) {
    console.info(`- ${entry.name}: ${entry.action}`);
  }

  if ((process.env.ENTRA_CLIENT_SECRET ?? "").trim().length === 0) {
    console.info(
      "entra-client-secret was set to placeholder value 'set-me' unless you supplied ENTRA_CLIENT_SECRET. Rotate it before enabling AUTH_MODE=entra."
    );
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
