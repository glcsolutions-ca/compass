import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { resolveDatabaseUrl } from "./constants.mjs";
import { validateMigrationPolicy } from "./migration-policy-lib.mjs";

const require = createRequire(import.meta.url);
const cliPath = require.resolve("node-pg-migrate/bin/node-pg-migrate");
const migrationsDir = path.resolve("db/migrations");
const migrationsGlob = path.join(migrationsDir, "*.mjs");
// Scratch-drill trigger marker: intentionally non-functional.
// Final-proof scratch-drill marker: intentionally non-functional.
// Post-infra-fix scratch-drill marker: intentionally non-functional.
// Post-cert-order-fix final-proof marker: intentionally non-functional.
const supportedCommands = new Set(["up", "down", "redo"]);

function sanitizeIdentifier(value, name) {
  const normalized = String(value || "").trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/u.test(normalized)) {
    throw new Error(`Invalid SQL identifier for ${name}: ${normalized}`);
  }
  return normalized;
}

async function main() {
  const command = process.argv[2];
  const extraArgs = process.argv.slice(3);
  if (!command || !supportedCommands.has(command)) {
    console.error("Usage: node db/scripts/migrate.mjs <up|down|redo> [args]");
    process.exit(1);
  }

  const policy = await validateMigrationPolicy();
  if (!policy.ok) {
    console.error("Migration policy violations:");
    for (const failure of policy.failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  const databaseUrl = resolveDatabaseUrl();
  const migrationsTable = sanitizeIdentifier(
    process.env.MIGRATIONS_TABLE?.trim() || "pgmigrations",
    "MIGRATIONS_TABLE"
  );
  const schema = sanitizeIdentifier(process.env.DB_SCHEMA?.trim() || "public", "DB_SCHEMA");
  const migrationsSchema = sanitizeIdentifier(
    process.env.MIGRATIONS_SCHEMA?.trim() || schema,
    "MIGRATIONS_SCHEMA"
  );
  const migrationLockTimeout = process.env.MIGRATION_LOCK_TIMEOUT?.trim() || "5s";
  const migrationStatementTimeout = process.env.MIGRATION_STATEMENT_TIMEOUT?.trim() || "15min";
  const pgOptions = [
    process.env.PGOPTIONS?.trim() || "",
    `-c lock_timeout=${migrationLockTimeout}`,
    `-c statement_timeout=${migrationStatementTimeout}`
  ]
    .filter((part) => part.length > 0)
    .join(" ");

  const args = [
    cliPath,
    command,
    "--migrations-dir",
    migrationsGlob,
    "--use-glob",
    "--migrations-table",
    migrationsTable,
    "--schema",
    schema,
    "--migrations-schema",
    migrationsSchema,
    "--check-order",
    "--lock",
    "--single-transaction",
    ...extraArgs
  ];

  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PGOPTIONS: pgOptions
    }
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });
}

void main();
