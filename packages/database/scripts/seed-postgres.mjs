import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { Client } from "pg";
import { resolveDatabaseUrl } from "./constants.mjs";
import { SEEDS_DIR } from "./paths.mjs";

const SEED_TEMPLATE_DEFAULTS = {
  SEED_DEFAULT_TENANT_ID: "acceptance-tenant",
  SEED_DEFAULT_APP_CLIENT_ID: "integration-client",
  SEED_DEFAULT_USER_OID: "smoke-user",
  SEED_DEFAULT_USER_EMAIL: "smoke-user@compass.local",
  SEED_DEFAULT_USER_DISPLAY_NAME: "Smoke User"
};

function escapeSqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function renderSeedTemplate(sql) {
  return sql.replaceAll(/{{([A-Z0-9_]+)}}/g, (_match, variableName) => {
    const fromEnv = process.env[variableName]?.trim();
    const resolved = fromEnv && fromEnv.length > 0 ? fromEnv : SEED_TEMPLATE_DEFAULTS[variableName];
    if (!resolved) {
      throw new Error(
        `Seed template variable ${variableName} is not set and no default is defined`
      );
    }

    return escapeSqlLiteral(resolved);
  });
}

async function loadSeedFiles(seedsDir) {
  const entries = await readdir(seedsDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => path.join(seedsDir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  const seedFiles = await loadSeedFiles(SEEDS_DIR);

  if (seedFiles.length === 0) {
    console.info(`No seed files found in ${SEEDS_DIR}; skipping seed step.`);
    return;
  }

  const client = new Client({
    connectionString: resolveDatabaseUrl()
  });

  try {
    await client.connect();

    for (const seedPath of seedFiles) {
      const rawSql = await readFile(seedPath, "utf8");
      const sql = renderSeedTemplate(rawSql);
      await client.query(sql);
      console.info(`Seeded Postgres using ${seedPath}`);
    }
  } finally {
    await client.end();
  }
}

void main();
