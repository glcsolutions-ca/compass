import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { Client } from "pg";
import { resolveDatabaseUrl } from "./constants.mjs";

const SEED_TEMPLATE_DEFAULTS = {
  AUTH_BOOTSTRAP_ALLOWED_TENANT_ID: "acceptance-tenant",
  AUTH_BOOTSTRAP_ALLOWED_APP_CLIENT_ID: "integration-client",
  AUTH_BOOTSTRAP_DELEGATED_USER_OID: "smoke-user",
  AUTH_BOOTSTRAP_DELEGATED_USER_EMAIL: "smoke-user@compass.local",
  AUTH_BOOTSTRAP_DELEGATED_USER_DISPLAY_NAME: "Smoke User"
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
