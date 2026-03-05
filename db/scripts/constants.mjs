function normalizeValue(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildDatabaseUrlFromPort(portValue) {
  const normalized = normalizeValue(portValue);
  if (!normalized) {
    return undefined;
  }

  if (!/^\d+$/u.test(normalized)) {
    throw new Error(`Invalid POSTGRES_PORT value: ${normalized}`);
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`Invalid POSTGRES_PORT value: ${normalized}`);
  }

  return `postgres://compass:compass@localhost:${parsed}/compass`;
}

export function resolveDatabaseUrlFromSources({
  envDatabaseUrl,
  dbEnvDatabaseUrl,
  dbEnvPostgresPort,
  fallbackPostgresPort
} = {}) {
  const explicitUrl = normalizeValue(envDatabaseUrl);
  if (explicitUrl) {
    return explicitUrl;
  }

  const fileDatabaseUrl = normalizeValue(dbEnvDatabaseUrl);
  if (fileDatabaseUrl) {
    return fileDatabaseUrl;
  }

  const derivedFromFile = buildDatabaseUrlFromPort(dbEnvPostgresPort);
  if (derivedFromFile) {
    return derivedFromFile;
  }

  const derivedFromFallbackPort = buildDatabaseUrlFromPort(fallbackPostgresPort);
  if (derivedFromFallbackPort) {
    return derivedFromFallbackPort;
  }

  throw new Error("DATABASE_URL or POSTGRES_PORT is required to resolve the database connection.");
}

export function resolveDatabaseUrl({ env = process.env } = {}) {
  return resolveDatabaseUrlFromSources({
    envDatabaseUrl: env.DATABASE_URL,
    dbEnvDatabaseUrl: undefined,
    dbEnvPostgresPort: env.POSTGRES_PORT,
    fallbackPostgresPort: undefined
  });
}
