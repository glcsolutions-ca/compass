import path from "node:path";
import { readFileSync } from "node:fs";

export const DEFAULT_DATABASE_URL = "postgres://compass:compass@localhost:5432/compass";
const DEFAULT_POSTGRES_ENV_PATH = path.resolve("db/postgres/.env");

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

    const value = match[2].trim();
    parsed[match[1]] = stripMatchingQuotes(value);
  }

  return parsed;
}

function stripMatchingQuotes(value) {
  if (value.length < 2) {
    return value;
  }

  const first = value[0];
  const last = value[value.length - 1];
  if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
    return value.slice(1, -1);
  }

  return value;
}

function readEnvFile(envPath) {
  try {
    const content = readFileSync(envPath, "utf8");
    return parseEnvText(content);
  } catch {
    return {};
  }
}

function buildDatabaseUrlFromPort(portValue) {
  const normalized = normalizeValue(portValue);
  if (!normalized) {
    return undefined;
  }

  if (!/^\d+$/u.test(normalized)) {
    throw new Error(`Invalid POSTGRES_PORT in db/postgres/.env: ${normalized}`);
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`Invalid POSTGRES_PORT in db/postgres/.env: ${normalized}`);
  }

  return `postgres://compass:compass@localhost:${parsed}/compass`;
}

export function resolveDatabaseUrl({
  env = process.env,
  postgresEnvPath = DEFAULT_POSTGRES_ENV_PATH
} = {}) {
  const explicitUrl = normalizeValue(env.DATABASE_URL);
  if (explicitUrl) {
    return explicitUrl;
  }

  const postgresEnv = readEnvFile(postgresEnvPath);
  const fileDatabaseUrl = normalizeValue(postgresEnv.DATABASE_URL);
  if (fileDatabaseUrl) {
    return fileDatabaseUrl;
  }

  const derivedUrl = buildDatabaseUrlFromPort(postgresEnv.POSTGRES_PORT);
  if (derivedUrl) {
    return derivedUrl;
  }

  return DEFAULT_DATABASE_URL;
}
