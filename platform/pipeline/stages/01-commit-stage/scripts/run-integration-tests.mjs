import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { runCommand } from "../../../shared/scripts/command-runner.mjs";
import { reserveFreePort } from "../../../shared/scripts/reserve-free-port.mjs";

const INTEGRATION_AUTH_ENV = Object.freeze({
  WEB_BASE_URL: "http://localhost:3000",
  AUTH_MODE: "entra",
  ENTRA_CLIENT_ID: "compass-client-id",
  ENTRA_CLIENT_SECRET: "compass-client-secret",
  ENTRA_REDIRECT_URI: "http://localhost:3000/v1/auth/entra/callback",
  AUTH_OIDC_STATE_ENCRYPTION_KEY: Buffer.from(
    "12345678901234567890123456789012",
    "utf8"
  ).toString("base64url"),
  ENTRA_ALLOWED_TENANT_IDS:
    "11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222"
});

export async function runIntegrationTests() {
  const postgresPort = await reserveFreePort();
  const composeProjectName = `compass-integration-${randomUUID().slice(0, 8)}`;
  const databaseUrl = `postgres://compass:compass@localhost:${String(postgresPort)}/compass`;
  const databaseEnv = {
    ...process.env,
    ...INTEGRATION_AUTH_ENV,
    COMPOSE_PROJECT_NAME: composeProjectName,
    POSTGRES_PORT: String(postgresPort),
    DATABASE_URL: databaseUrl
  };

  await runCommand(
    process.execPath,
    ["packages/database/scripts/postgres-compose.mjs", "up", "-d", "postgres"],
    {
      env: databaseEnv
    }
  );

  let integrationError;
  try {
    await runCommand(process.execPath, ["packages/database/scripts/wait-for-postgres.mjs"], {
      env: databaseEnv
    });
    await runCommand(process.execPath, ["packages/database/scripts/check-migration-policy.mjs"], {
      env: databaseEnv
    });
    await runCommand(process.execPath, ["packages/database/scripts/migrate.mjs", "up"], {
      env: databaseEnv
    });
    await runCommand(process.execPath, ["packages/database/scripts/seed-postgres.mjs"], {
      env: databaseEnv
    });
    await runCommand("pnpm", ["--filter", "@compass/api", "test:integration"], {
      env: databaseEnv
    });
  } catch (error) {
    integrationError = error;
    try {
      await runCommand(
        process.execPath,
        ["packages/database/scripts/postgres-compose.mjs", "logs", "postgres"],
        {
          env: databaseEnv
        }
      );
    } catch {}
  } finally {
    try {
      await runCommand(
        process.execPath,
        ["packages/database/scripts/postgres-compose.mjs", "down", "--volumes"],
        { env: databaseEnv }
      );
    } catch (teardownError) {
      if (!integrationError) {
        throw teardownError;
      }
    }
  }

  if (integrationError) {
    throw integrationError;
  }
}

export async function main() {
  await runIntegrationTests();
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
