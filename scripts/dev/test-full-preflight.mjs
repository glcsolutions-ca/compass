import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import { withCcsGuardrail } from "../pipeline/shared/ccs-contract.mjs";

function normalizeValue(value) {
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

    parsed[match[1]] = match[2].trim().replace(/^['"]|['"]$/gu, "");
  }

  return parsed;
}

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
    guidance: ["pnpm db:postgres:up", "pnpm test:full", "pnpm db:postgres:down"]
  });
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

async function pathExists(filePath, accessFn) {
  try {
    await accessFn(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveDatabaseUrlForFullTest({
  rootDir = process.cwd(),
  env = process.env,
  readFileFn = readFile,
  accessFn = access
} = {}) {
  const explicitUrl = normalizeValue(env.DATABASE_URL);
  if (explicitUrl) {
    ensurePostgresUrlSyntax(explicitUrl);
    return { databaseUrl: explicitUrl, source: "DATABASE_URL" };
  }

  const postgresEnvPath = path.resolve(rootDir, "db/postgres/.env");
  const hasPostgresEnv = await pathExists(postgresEnvPath, accessFn);
  if (!hasPostgresEnv) {
    throw createBackendPrereqError();
  }

  const fileContent = await readFileFn(postgresEnvPath, "utf8");
  const values = parseEnvText(fileContent);
  const fromFile = normalizeValue(values.DATABASE_URL);
  if (fromFile) {
    ensurePostgresUrlSyntax(fromFile);
    return {
      databaseUrl: fromFile,
      source: "db/postgres/.env DATABASE_URL"
    };
  }

  const postgresPort = normalizeValue(values.POSTGRES_PORT);
  if (!postgresPort || !/^\d+$/u.test(postgresPort)) {
    throw createBackendPrereqError();
  }

  const localUrl = buildLocalDatabaseUrlFromPort(postgresPort);
  return {
    databaseUrl: localUrl,
    source: "db/postgres/.env POSTGRES_PORT"
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
  readFileFn = readFile,
  accessFn = access,
  connectFn = canConnect
} = {}) {
  const { databaseUrl, source } = await resolveDatabaseUrlForFullTest({
    rootDir,
    env,
    readFileFn,
    accessFn
  });

  const reachable = await connectFn(databaseUrl);
  if (!reachable) {
    throw createBackendPrereqError();
  }

  logger.info(`test:full preflight passed (${source}).`);
}

async function main() {
  await withCcsGuardrail({
    guardrailId: "test.full-preflight",
    command: "pnpm test:full",
    passCode: "FULL000",
    passRef: "docs/agents/workflow-playbook.md#standard-agent-loop",
    run: async () => {
      await runTestFullPreflight();
      return { status: "pass", code: "FULL000" };
    },
    mapError: (error) => {
      if (error instanceof PreflightError) {
        printPreflightError(error);
        return {
          code: error.code,
          why: error.details.join(" ").replace(/^- /u, ""),
          fix: "Start local Postgres and rerun full test gate.",
          doCommands: error.guidance,
          ref: "docs/agents/workflow-playbook.md#standard-agent-loop"
        };
      }

      return {
        code: "CCS_UNEXPECTED_ERROR",
        why: error instanceof Error ? error.message : String(error),
        fix: "Resolve preflight runtime errors before running full gate.",
        doCommands: ["pnpm test:full"],
        ref: "docs/ccs.md#output-format"
      };
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
