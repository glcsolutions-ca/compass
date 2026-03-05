import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import { normalizeEnvValue, readEnvLayer, resolveLayeredEnvValue } from "../shared/env-files.mjs";

function buildLocalDatabaseUrlFromPort(port) {
  return `postgres://compass:compass@localhost:${port}/compass`;
}

function ensurePostgresUrlSyntax(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw createBackendPrereqError();
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw createBackendPrereqError();
  }
}

export class PreflightError extends Error {
  constructor({ code, summary, details = [], guidance }) {
    super(summary);
    this.name = "PreflightError";
    this.code = code;
    this.summary = summary;
    this.details = details;
    this.guidance = guidance;
  }
}

function createBackendPrereqError() {
  return new PreflightError({
    code: "FULL001",
    summary: "backend prerequisites missing",
    details: ["- DATABASE_URL not resolvable or Postgres not reachable"],
    guidance: ["pnpm dev", "pnpm test:full", "pnpm dev:down"]
  });
}

function parsePort(value) {
  const normalized = normalizeEnvValue(value);
  if (!normalized) {
    return undefined;
  }

  if (!/^\d+$/u.test(normalized)) {
    throw createBackendPrereqError();
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw createBackendPrereqError();
  }

  return parsed;
}

export async function canConnect(databaseUrl) {
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

export async function resolveDatabaseUrlForFullTest({
  rootDir = process.cwd(),
  env = process.env
} = {}) {
  const postgresEnvPath = path.resolve(rootDir, "db/postgres/.env");
  const layer = await readEnvLayer(postgresEnvPath);

  const fromEnvDatabaseUrl = normalizeEnvValue(env.DATABASE_URL);
  if (fromEnvDatabaseUrl) {
    ensurePostgresUrlSyntax(fromEnvDatabaseUrl);
    return {
      databaseUrl: fromEnvDatabaseUrl,
      source: "DATABASE_URL"
    };
  }

  const layeredPort =
    parsePort(
      resolveLayeredEnvValue({
        key: "POSTGRES_PORT",
        processEnv: env,
        envLocalValues: layer.envLocalValues,
        envValues: layer.envValues
      })
    ) ?? undefined;

  if (!layeredPort) {
    throw createBackendPrereqError();
  }

  return {
    databaseUrl: buildLocalDatabaseUrlFromPort(layeredPort),
    source: normalizeEnvValue(env.POSTGRES_PORT)
      ? "POSTGRES_PORT"
      : normalizeEnvValue(layer.envLocalValues.POSTGRES_PORT)
        ? "db/postgres/.env.local POSTGRES_PORT"
        : "db/postgres/.env POSTGRES_PORT"
  };
}

function printPreflightError(error, logger = console) {
  logger.error(`${error.code} ${error.summary}`);
  for (const detail of error.details) {
    logger.error(detail);
  }
  logger.error("Fix:");
  for (const command of error.guidance) {
    logger.error(`  ${command}`);
  }
}

export async function runTestFullPreflight({
  rootDir = process.cwd(),
  env = process.env,
  logger = console,
  connectFn = canConnect
} = {}) {
  const { databaseUrl, source } = await resolveDatabaseUrlForFullTest({
    rootDir,
    env
  });

  const reachable = await connectFn(databaseUrl);
  if (!reachable) {
    throw createBackendPrereqError();
  }

  logger.info(`test:full preflight passed (${source}).`);
}

async function main() {
  try {
    await runTestFullPreflight();
  } catch (error) {
    if (error instanceof PreflightError) {
      printPreflightError(error);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
