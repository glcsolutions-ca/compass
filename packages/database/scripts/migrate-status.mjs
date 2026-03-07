import { Client } from "pg";
import { resolveDatabaseUrl } from "./constants.mjs";
import { validateMigrationPolicy } from "./migration-policy-lib.mjs";

function sanitizeIdentifier(value, name) {
  const normalized = String(value || "").trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/u.test(normalized)) {
    throw new Error(`Invalid SQL identifier for ${name}: ${normalized}`);
  }
  return normalized;
}

async function getAppliedMigrations(client, migrationsTable) {
  await client.query(
    `
      CREATE TABLE IF NOT EXISTS ${migrationsTable} (
        id SERIAL PRIMARY KEY,
        name varchar(255) NOT NULL,
        run_on timestamp NOT NULL
      )
    `
  );

  const result = await client.query(`SELECT name FROM ${migrationsTable} ORDER BY run_on, id`);

  return new Set(result.rows.map((row) => row.name));
}

async function main() {
  const policy = await validateMigrationPolicy();
  if (!policy.ok) {
    console.error("Migration policy violations:");
    for (const failure of policy.failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  const files = policy.migrationFiles;
  const migrationsTable = sanitizeIdentifier(
    process.env.MIGRATIONS_TABLE?.trim() || "pgmigrations",
    "MIGRATIONS_TABLE"
  );
  const client = new Client({ connectionString: resolveDatabaseUrl() });

  try {
    await client.connect();
    const applied = await getAppliedMigrations(client, migrationsTable);

    const lines = files.map((file) => {
      const name = file.replace(/\.mjs$/u, "");
      const state = applied.has(name) ? "applied" : "pending";
      return `${state.padEnd(8)} ${name}`;
    });

    if (lines.length === 0) {
      console.info("No migration files found.");
      return;
    }

    console.info("Migration status:");
    for (const line of lines) {
      console.info(`- ${line}`);
    }
  } finally {
    await client.end();
  }
}

void main();
