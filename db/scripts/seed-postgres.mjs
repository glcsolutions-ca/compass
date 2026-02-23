import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { Client } from "pg";
import { resolveDatabaseUrl } from "./constants.mjs";

async function loadSeedFiles(seedsDir) {
  const entries = await readdir(seedsDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => path.join(seedsDir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  const seedsDir = path.resolve("db/seeds");
  const seedFiles = await loadSeedFiles(seedsDir);

  if (seedFiles.length === 0) {
    console.info(`No seed files found in ${seedsDir}; skipping seed step.`);
    return;
  }

  const client = new Client({
    connectionString: resolveDatabaseUrl()
  });

  try {
    await client.connect();

    for (const seedPath of seedFiles) {
      const sql = await readFile(seedPath, "utf8");
      await client.query(sql);
      console.info(`Seeded Postgres using ${seedPath}`);
    }
  } finally {
    await client.end();
  }
}

void main();
