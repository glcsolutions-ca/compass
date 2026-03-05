import { Client } from "pg";
import { resolveLocalDevEnv } from "./local-env.mjs";

function normalize(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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
  const resolved = await resolveLocalDevEnv({ rootDir, env: process.env });

  const databaseUrl = normalize(resolved.env.DATABASE_URL);
  if (!databaseUrl || !(await canConnectPostgres(databaseUrl))) {
    console.error(
      `env:doctor: Postgres is not reachable for ${databaseUrl ?? "<missing DATABASE_URL>"}.`
    );
    console.error("Fix:");
    console.error("  pnpm dev");
    console.error("  or pnpm --filter @compass/db-tools run postgres:up");
    process.exitCode = 1;
    return;
  }

  const runtimeEndpoint = normalize(resolved.env.AGENT_RUNTIME_ENDPOINT);
  if (!runtimeEndpoint || !(await canReachRuntime(runtimeEndpoint))) {
    console.error("env:doctor: session runtime is not reachable.");
    console.error("Fix:");
    console.error("  pnpm dev");
    process.exitCode = 1;
    return;
  }

  console.info(
    `env:doctor passed (web/api/postgres/runtime: ${resolved.ports.WEB_PORT}/${resolved.ports.API_PORT}/${resolved.ports.POSTGRES_PORT}/${resolved.ports.SESSION_RUNTIME_PORT}).`
  );
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
