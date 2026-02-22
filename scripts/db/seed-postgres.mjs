import path from "node:path";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { resolveDatabaseUrl } from "./constants.mjs";

async function main() {
  const seedPath = path.resolve("db/postgres/seed/001_consolidated_employee_views.sql");
  const sql = await readFile(seedPath, "utf8");
  const client = new Client({
    connectionString: resolveDatabaseUrl()
  });

  try {
    await client.connect();
    await client.query(sql);
    console.info(`Seeded Postgres using ${seedPath}`);
  } finally {
    await client.end();
  }
}

void main();
