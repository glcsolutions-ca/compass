import { readdir } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { resolveDatabaseUrl } from "./constants.mjs";

async function listMigrationFiles() {
  const migrationsDir = path.resolve("migrations");
  const entries = await readdir(migrationsDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(".js") || name.endsWith(".ts") || name.endsWith(".sql"))
    .sort();
}

async function getAppliedMigrations(client) {
  await client.query(
    `
      CREATE TABLE IF NOT EXISTS pgmigrations (
        id SERIAL PRIMARY KEY,
        name varchar(255) NOT NULL,
        run_on timestamp NOT NULL
      )
    `
  );

  const result = await client.query("SELECT name FROM pgmigrations ORDER BY run_on, id");

  return new Set(result.rows.map((row) => row.name));
}

async function main() {
  const files = await listMigrationFiles();
  const client = new Client({ connectionString: resolveDatabaseUrl() });

  try {
    await client.connect();
    const applied = await getAppliedMigrations(client);

    const lines = files.map((file) => {
      const name = file.replace(/\.(js|ts|sql)$/u, "");
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
