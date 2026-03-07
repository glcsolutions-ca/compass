import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDatabaseUrlFromSources } from "../../../packages/database/scripts/constants.mjs";
import { normalizeEnvValue, readEnvLayer } from "../shared/env-files.mjs";

const SERVICE_ENV_PATHS = {
  api: "apps/api/.env",
  web: "apps/web/.env",
  db: "packages/database/postgres/.env"
};

const PORT_KEYS = ["WEB_PORT", "API_PORT", "POSTGRES_PORT"];
const DEFAULT_PORTS = {
  WEB_PORT: 3000,
  API_PORT: 3001,
  POSTGRES_PORT: 5432
};

function parsePort(value, sourceLabel) {
  const normalized = normalizeEnvValue(value);
  if (!normalized) {
    return undefined;
  }

  if (!/^\d+$/u.test(normalized)) {
    throw new Error(`${sourceLabel} must be a decimal integer port (received ${normalized})`);
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`${sourceLabel} must be between 1 and 65535 (received ${normalized})`);
  }

  return parsed;
}

function parseOrigin(value, sourceLabel) {
  const normalized = normalizeEnvValue(value);
  if (!normalized) {
    return undefined;
  }

  try {
    return new URL(normalized).origin;
  } catch {
    throw new Error(`${sourceLabel} must be a valid absolute URL (received ${normalized})`);
  }
}

async function isPortAvailable(port) {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.unref();

    server.once("error", () => {
      resolve(false);
    });

    server.listen({ host: "127.0.0.1", port }, () => {
      server.close(() => {
        resolve(true);
      });
    });
  });
}

async function loadServiceEnvLayers(rootDir) {
  const layers = {};

  for (const [service, relativeEnvPath] of Object.entries(SERVICE_ENV_PATHS)) {
    layers[service] = await readEnvLayer(path.resolve(rootDir, relativeEnvPath));
  }

  return layers;
}

function resolvePortAssignment({
  key,
  processEnv,
  envLocalValues,
  envValues,
  envFileKey,
  defaultPort
}) {
  const processValue = normalizeEnvValue(processEnv[key]);
  if (processValue) {
    return {
      port: parsePort(processValue, `process.env.${key}`),
      source: `process.env.${key}`,
      pinned: true,
      basePort: undefined
    };
  }

  const localValue = normalizeEnvValue(envLocalValues[envFileKey]);
  if (localValue) {
    return {
      port: parsePort(localValue, `.env.local ${envFileKey}`),
      source: `.env.local ${envFileKey}`,
      pinned: true,
      basePort: undefined
    };
  }

  const basePort = parsePort(envValues[envFileKey], `.env ${envFileKey}`) ?? defaultPort;
  return {
    port: basePort,
    source: `.env ${envFileKey} default`,
    pinned: false,
    basePort
  };
}

function ensurePinnedPortUniqueness(assignments) {
  const seen = new Map();

  for (const key of PORT_KEYS) {
    const assignment = assignments[key];
    if (!assignment.pinned) {
      continue;
    }

    const existingKey = seen.get(assignment.port);
    if (existingKey) {
      throw new Error(
        `Pinned ports conflict: ${existingKey} and ${key} both resolve to ${assignment.port}.`
      );
    }

    seen.set(assignment.port, key);
  }
}

async function assignHybridPorts({ assignments, isPortAvailableFn }) {
  const reservedPinnedPorts = new Set();

  for (const key of PORT_KEYS) {
    const assignment = assignments[key];
    if (!assignment.pinned) {
      continue;
    }

    if (!(await isPortAvailableFn(assignment.port))) {
      throw new Error(
        `${key} is pinned to ${assignment.port} via ${assignment.source}, but the port is in use.`
      );
    }

    reservedPinnedPorts.add(assignment.port);
  }

  const autoKeys = PORT_KEYS.filter((key) => !assignments[key].pinned);
  if (autoKeys.length === 0) {
    return;
  }

  const maxStep = Math.min(
    ...autoKeys.map((key) => Math.floor((65_535 - assignments[key].basePort) / 10))
  );

  for (let step = 0; step <= maxStep; step += 1) {
    const trialPorts = new Set();
    let validStep = true;

    for (const key of autoKeys) {
      const candidate = assignments[key].basePort + step * 10;

      if (candidate < 1 || candidate > 65_535) {
        validStep = false;
        break;
      }

      if (reservedPinnedPorts.has(candidate) || trialPorts.has(candidate)) {
        validStep = false;
        break;
      }

      if (!(await isPortAvailableFn(candidate))) {
        validStep = false;
        break;
      }

      trialPorts.add(candidate);
    }

    if (!validStep) {
      continue;
    }

    for (const key of autoKeys) {
      assignments[key].port = assignments[key].basePort + step * 10;
      if (step > 0) {
        assignments[key].source = `${assignments[key].source} (+${step * 10} fallback)`;
      }
    }

    return;
  }

  throw new Error(
    "Unable to allocate ports. Set explicit WEB_PORT/API_PORT/POSTGRES_PORT overrides."
  );
}

function resolveDerivedEnv({ processEnv, layers, ports }) {
  const defaultWebBaseUrl = `http://localhost:${ports.WEB_PORT}`;

  const webBaseUrl =
    parseOrigin(processEnv.WEB_BASE_URL, "WEB_BASE_URL") ??
    parseOrigin(layers.api.envLocalValues.WEB_BASE_URL, "WEB_BASE_URL") ??
    defaultWebBaseUrl;

  const entraRedirectUri =
    normalizeEnvValue(processEnv.ENTRA_REDIRECT_URI) ??
    normalizeEnvValue(layers.api.envLocalValues.ENTRA_REDIRECT_URI) ??
    `${webBaseUrl}/v1/auth/entra/callback`;

  const databaseUrl = resolveDatabaseUrlFromSources({
    envDatabaseUrl: processEnv.DATABASE_URL,
    dbEnvPostgresPort: String(ports.POSTGRES_PORT)
  });

  const apiBaseUrl =
    normalizeEnvValue(processEnv.VITE_API_BASE_URL) ??
    normalizeEnvValue(layers.web.envLocalValues.VITE_API_BASE_URL) ??
    `http://localhost:${ports.API_PORT}`;

  const authMode =
    normalizeEnvValue(processEnv.AUTH_MODE) ??
    normalizeEnvValue(layers.api.envLocalValues.AUTH_MODE) ??
    normalizeEnvValue(layers.api.envValues.AUTH_MODE) ??
    "mock";

  const defaultExecutionMode =
    normalizeEnvValue(processEnv.AGENT_DEFAULT_EXECUTION_MODE) ??
    normalizeEnvValue(layers.api.envLocalValues.AGENT_DEFAULT_EXECUTION_MODE) ??
    normalizeEnvValue(layers.api.envValues.AGENT_DEFAULT_EXECUTION_MODE) ??
    "local";

  const runtimeProvider =
    normalizeEnvValue(processEnv.AGENT_RUNTIME_PROVIDER) ??
    normalizeEnvValue(layers.api.envLocalValues.AGENT_RUNTIME_PROVIDER) ??
    normalizeEnvValue(layers.api.envValues.AGENT_RUNTIME_PROVIDER) ??
    (defaultExecutionMode === "local" ? "local_process" : "dynamic_sessions");

  const host =
    normalizeEnvValue(processEnv.HOST) ??
    normalizeEnvValue(layers.api.envLocalValues.HOST) ??
    normalizeEnvValue(layers.api.envValues.HOST) ??
    "127.0.0.1";

  const composeProjectName =
    normalizeEnvValue(processEnv.COMPOSE_PROJECT_NAME) ??
    normalizeEnvValue(layers.db.envLocalValues.COMPOSE_PROJECT_NAME) ??
    normalizeEnvValue(layers.db.envValues.COMPOSE_PROJECT_NAME) ??
    "compass";

  return {
    WEB_BASE_URL: webBaseUrl,
    ENTRA_REDIRECT_URI: entraRedirectUri,
    VITE_API_BASE_URL: apiBaseUrl,
    VITE_AGENT_DEFAULT_EXECUTION_MODE: defaultExecutionMode,
    AGENT_DEFAULT_EXECUTION_MODE: defaultExecutionMode,
    AGENT_RUNTIME_PROVIDER: runtimeProvider,
    DATABASE_URL: databaseUrl,
    AUTH_MODE: authMode,
    HOST: host,
    COMPOSE_PROJECT_NAME: composeProjectName
  };
}

export async function resolveLocalDevEnv({
  rootDir = process.cwd(),
  env = process.env,
  isPortAvailableFn = isPortAvailable
} = {}) {
  const layers = await loadServiceEnvLayers(rootDir);

  const assignments = {
    WEB_PORT: resolvePortAssignment({
      key: "WEB_PORT",
      processEnv: env,
      envLocalValues: layers.web.envLocalValues,
      envValues: layers.web.envValues,
      envFileKey: "WEB_PORT",
      defaultPort: DEFAULT_PORTS.WEB_PORT
    }),
    API_PORT: resolvePortAssignment({
      key: "API_PORT",
      processEnv: env,
      envLocalValues: layers.api.envLocalValues,
      envValues: layers.api.envValues,
      envFileKey: "API_PORT",
      defaultPort: DEFAULT_PORTS.API_PORT
    }),
    POSTGRES_PORT: resolvePortAssignment({
      key: "POSTGRES_PORT",
      processEnv: env,
      envLocalValues: layers.db.envLocalValues,
      envValues: layers.db.envValues,
      envFileKey: "POSTGRES_PORT",
      defaultPort: DEFAULT_PORTS.POSTGRES_PORT
    })
  };

  ensurePinnedPortUniqueness(assignments);
  await assignHybridPorts({ assignments, isPortAvailableFn });

  const ports = {
    WEB_PORT: assignments.WEB_PORT.port,
    API_PORT: assignments.API_PORT.port,
    POSTGRES_PORT: assignments.POSTGRES_PORT.port
  };

  const derived = resolveDerivedEnv({ processEnv: env, layers, ports });

  return {
    ports,
    portAssignments: assignments,
    env: {
      WEB_PORT: String(ports.WEB_PORT),
      API_PORT: String(ports.API_PORT),
      POSTGRES_PORT: String(ports.POSTGRES_PORT),
      VITE_API_BASE_URL: derived.VITE_API_BASE_URL,
      VITE_AGENT_DEFAULT_EXECUTION_MODE: derived.VITE_AGENT_DEFAULT_EXECUTION_MODE,
      WEB_BASE_URL: derived.WEB_BASE_URL,
      ENTRA_REDIRECT_URI: derived.ENTRA_REDIRECT_URI,
      AGENT_DEFAULT_EXECUTION_MODE: derived.AGENT_DEFAULT_EXECUTION_MODE,
      AGENT_RUNTIME_PROVIDER: derived.AGENT_RUNTIME_PROVIDER,
      DATABASE_URL: derived.DATABASE_URL,
      AUTH_MODE: derived.AUTH_MODE,
      HOST: derived.HOST,
      COMPOSE_PROJECT_NAME: derived.COMPOSE_PROJECT_NAME
    }
  };
}

function isExecutedDirectly() {
  if (!process.argv[1]) {
    return false;
  }

  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isExecutedDirectly()) {
  await resolveLocalDevEnv()
    .then((resolved) => {
      console.info(JSON.stringify({ ports: resolved.ports }, null, 2));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
