import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

function normalize(value) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseEnvText(content) {
  const parsed = {};

  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    parsed[key] = rawValue.trim().replace(/^['"]|['"]$/gu, "");
  }

  return parsed;
}

async function readEnvFile(filePath) {
  try {
    await access(filePath);
  } catch {
    return {};
  }

  const content = await readFile(filePath, "utf8");
  return parseEnvText(content);
}

function parseFlag(value, fallback = false) {
  const normalized = normalize(value);
  if (!normalized) {
    return fallback;
  }
  return normalized.toLowerCase() === "true";
}

async function canConnectPostgres(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

async function canReachRuntime(endpoint) {
  try {
    const response = await fetch(`${endpoint.replace(/\/+$/u, "")}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  const rootDir = process.cwd();
  const apiEnv = await readEnvFile(path.resolve(rootDir, "apps/api/.env"));
  const dbEnv = await readEnvFile(path.resolve(rootDir, "db/postgres/.env"));

  const databaseUrl =
    normalize(process.env.DATABASE_URL) ??
    normalize(apiEnv.DATABASE_URL) ??
    normalize(dbEnv.DATABASE_URL);
  if (!databaseUrl || !(await canConnectPostgres(databaseUrl))) {
    console.error("local-dev preflight: Postgres is not reachable.");
    console.error("Fix:");
    console.error("  pnpm db:postgres:up");
    process.exitCode = 1;
    return;
  }

  const agentGatewayEnabled = parseFlag(
    process.env.AGENT_GATEWAY_ENABLED ?? apiEnv.AGENT_GATEWAY_ENABLED,
    false
  );
  const runtimeProvider =
    normalize(process.env.AGENT_RUNTIME_PROVIDER ?? apiEnv.AGENT_RUNTIME_PROVIDER) ??
    "dynamic_sessions";
  const runtimeEndpoint = normalize(
    process.env.AGENT_RUNTIME_ENDPOINT ?? apiEnv.AGENT_RUNTIME_ENDPOINT
  );

  const requiresLocalRuntime =
    agentGatewayEnabled &&
    (runtimeProvider === "local_process" || runtimeProvider === "local_docker");

  if (requiresLocalRuntime) {
    if (!runtimeEndpoint || !(await canReachRuntime(runtimeEndpoint))) {
      console.error(
        `local-dev preflight: local runtime provider (${runtimeProvider}) is configured but runtime is not reachable.`
      );
      console.error("Fix:");
      console.error("  pnpm runtime:session:up");
      process.exitCode = 1;
      return;
    }
  }

  console.info("local-dev preflight passed.");
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
