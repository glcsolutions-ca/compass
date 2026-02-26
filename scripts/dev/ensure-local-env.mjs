import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT_RANGE_START = 41_000;
const PORT_RANGE_END = 60_999;
const PORT_STRIDE = 10;

const PORT_KEYS = ["WEB_PORT", "API_PORT", "POSTGRES_PORT"];
const PORT_OFFSETS = {
  WEB_PORT: 0,
  API_PORT: 1,
  POSTGRES_PORT: 2
};

const MANAGED_ENV_FILES = [
  {
    envPath: "apps/api/.env",
    examplePath: "apps/api/.env.example",
    requiredKeys: ["API_PORT"]
  },
  {
    envPath: "apps/web/.env",
    examplePath: "apps/web/.env.example",
    requiredKeys: ["WEB_PORT", "VITE_API_BASE_URL"]
  },
  {
    envPath: "db/postgres/.env",
    examplePath: "db/postgres/.env.example",
    requiredKeys: ["COMPOSE_PROJECT_NAME", "POSTGRES_PORT", "DATABASE_URL"]
  }
];

function normalizeValue(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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

    parsed[match[1]] = stripMatchingQuotes(match[2].trim());
  }

  return parsed;
}

function parsePort(value, sourceName) {
  const normalized = normalizeValue(value);
  if (!normalized) {
    return undefined;
  }

  if (!/^\d+$/u.test(normalized)) {
    throw new Error(`${sourceName} must be a decimal integer port (received: ${normalized})`);
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`${sourceName} must be between 1 and 65535 (received: ${normalized})`);
  }

  return parsed;
}

function parsePostgresPortFromDatabaseUrl(value, sourceName) {
  const normalized = normalizeValue(value);
  if (!normalized) {
    return undefined;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(normalized);
  } catch {
    throw new Error(`${sourceName} must be a valid URL when provided (received: ${normalized})`);
  }

  const isPostgresProtocol =
    parsedUrl.protocol === "postgres:" || parsedUrl.protocol === "postgresql:";
  if (!isPostgresProtocol) {
    return undefined;
  }

  const portCandidate = parsedUrl.port || "5432";
  return parsePort(portCandidate, `${sourceName} port`);
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readEnvState(rootDir, envPath) {
  const absolutePath = path.resolve(rootDir, envPath);

  if (!(await fileExists(absolutePath))) {
    return {
      exists: false,
      absolutePath,
      content: "",
      values: {}
    };
  }

  const content = await readFile(absolutePath, "utf8");
  return {
    exists: true,
    absolutePath,
    content,
    values: parseEnvText(content)
  };
}

async function loadAllEnvState(rootDir) {
  const states = new Map();

  for (const file of MANAGED_ENV_FILES) {
    states.set(file.envPath, await readEnvState(rootDir, file.envPath));
  }

  return states;
}

function getExistingValue(stateByPath, envPath, key) {
  const state = stateByPath.get(envPath);
  return state ? normalizeValue(state.values[key]) : undefined;
}

function getWorktreeSeed(rootDir) {
  const absoluteRoot = path.resolve(rootDir);
  const digest = createHash("sha256").update(absoluteRoot).digest("hex");
  return {
    shortSeed: digest.slice(0, 8),
    seedNumber: Number.parseInt(digest.slice(0, 8), 16)
  };
}

function getSlotCount() {
  const maxOffset = Math.max(...Object.values(PORT_OFFSETS));
  return Math.floor((PORT_RANGE_END - PORT_RANGE_START - maxOffset) / PORT_STRIDE) + 1;
}

function getPortTupleForSlot(slot) {
  const base = PORT_RANGE_START + slot * PORT_STRIDE;
  return {
    WEB_PORT: base + PORT_OFFSETS.WEB_PORT,
    API_PORT: base + PORT_OFFSETS.API_PORT,
    POSTGRES_PORT: base + PORT_OFFSETS.POSTGRES_PORT
  };
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

async function findGeneratedPortTuple({ rootDir, unresolvedPortKeys, isPortAvailableFn }) {
  if (unresolvedPortKeys.length === 0) {
    return {};
  }

  const slotCount = getSlotCount();
  const startSlot = getWorktreeSeed(rootDir).seedNumber % slotCount;

  for (let attempt = 0; attempt < slotCount; attempt += 1) {
    const slot = (startSlot + attempt) % slotCount;
    const tuple = getPortTupleForSlot(slot);

    let allAvailable = true;
    for (const key of unresolvedPortKeys) {
      if (!(await isPortAvailableFn(tuple[key]))) {
        allAvailable = false;
        break;
      }
    }

    if (allAvailable) {
      return tuple;
    }
  }

  throw new Error(
    `Unable to find a free generated port tuple in ${PORT_RANGE_START}-${PORT_RANGE_END}. Set explicit WEB_PORT/API_PORT/POSTGRES_PORT values in your .env files or shell env.`
  );
}

function setOrAppendEnvLine(content, key, value) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(`^(\\s*(?:export\\s+)?${escapedKey}\\s*=).*$`, "mu");
  const assignment = `${key}=${value}`;

  if (pattern.test(content)) {
    return content.replace(pattern, () => assignment);
  }

  const suffix = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  return `${content}${suffix}${assignment}\n`;
}

function appendOnlyMissingRequiredKeys(content, assignments, existingValues) {
  let output = content;

  for (const [key, value] of Object.entries(assignments)) {
    if (normalizeValue(existingValues[key])) {
      continue;
    }
    output = setOrAppendEnvLine(output, key, value);
  }

  return output;
}

function applyRequiredKeys(content, assignments) {
  let output = content;

  for (const [key, value] of Object.entries(assignments)) {
    output = setOrAppendEnvLine(output, key, value);
  }

  return output;
}

export async function resolveLocalEnvValues({
  rootDir = process.cwd(),
  env = process.env,
  stateByPath = undefined,
  isPortAvailableFn = isPortAvailable
} = {}) {
  const state = stateByPath ?? (await loadAllEnvState(rootDir));
  const explicitDatabaseUrl = normalizeValue(env.DATABASE_URL);
  const existingDatabaseUrl = getExistingValue(state, "db/postgres/.env", "DATABASE_URL");

  const existingPorts = {
    WEB_PORT: getExistingValue(state, "apps/web/.env", "WEB_PORT"),
    API_PORT: getExistingValue(state, "apps/api/.env", "API_PORT"),
    POSTGRES_PORT: getExistingValue(state, "db/postgres/.env", "POSTGRES_PORT")
  };

  const resolvedPorts = {
    WEB_PORT:
      parsePort(env.WEB_PORT, "WEB_PORT") ?? parsePort(existingPorts.WEB_PORT, "WEB_PORT in .env"),
    API_PORT:
      parsePort(env.API_PORT, "API_PORT") ?? parsePort(existingPorts.API_PORT, "API_PORT in .env"),
    POSTGRES_PORT:
      parsePort(env.POSTGRES_PORT, "POSTGRES_PORT") ??
      parsePostgresPortFromDatabaseUrl(explicitDatabaseUrl, "DATABASE_URL") ??
      parsePort(existingPorts.POSTGRES_PORT, "POSTGRES_PORT in .env") ??
      parsePostgresPortFromDatabaseUrl(existingDatabaseUrl, "DATABASE_URL in .env")
  };

  const unresolvedPortKeys = PORT_KEYS.filter((key) => !resolvedPorts[key]);
  const generatedPorts = await findGeneratedPortTuple({
    rootDir,
    unresolvedPortKeys,
    isPortAvailableFn
  });

  for (const key of unresolvedPortKeys) {
    resolvedPorts[key] = generatedPorts[key];
  }

  const existingViteApiBaseUrl = getExistingValue(state, "apps/web/.env", "VITE_API_BASE_URL");
  const existingComposeProjectName = getExistingValue(
    state,
    "db/postgres/.env",
    "COMPOSE_PROJECT_NAME"
  );

  const viteApiBaseUrl =
    normalizeValue(env.VITE_API_BASE_URL) ??
    existingViteApiBaseUrl ??
    `http://localhost:${resolvedPorts.API_PORT}`;
  const composeProjectName =
    normalizeValue(env.COMPOSE_PROJECT_NAME) ??
    existingComposeProjectName ??
    `compass-${getWorktreeSeed(rootDir).shortSeed}`;
  const databaseUrl =
    explicitDatabaseUrl ??
    existingDatabaseUrl ??
    `postgres://compass:compass@localhost:${resolvedPorts.POSTGRES_PORT}/compass`;

  return {
    ports: resolvedPorts,
    viteApiBaseUrl,
    composeProjectName,
    databaseUrl
  };
}

function buildRequiredAssignments(resolvedValues) {
  return {
    "apps/api/.env": {
      API_PORT: String(resolvedValues.ports.API_PORT)
    },
    "apps/web/.env": {
      WEB_PORT: String(resolvedValues.ports.WEB_PORT),
      VITE_API_BASE_URL: resolvedValues.viteApiBaseUrl
    },
    "db/postgres/.env": {
      COMPOSE_PROJECT_NAME: resolvedValues.composeProjectName,
      POSTGRES_PORT: String(resolvedValues.ports.POSTGRES_PORT),
      DATABASE_URL: resolvedValues.databaseUrl
    }
  };
}

export async function ensureLocalEnv({
  rootDir = process.cwd(),
  env = process.env,
  isPortAvailableFn = isPortAvailable,
  logger = console.info
} = {}) {
  const stateByPath = await loadAllEnvState(rootDir);
  const resolvedValues = await resolveLocalEnvValues({
    rootDir,
    env,
    stateByPath,
    isPortAvailableFn
  });
  const requiredAssignmentsByPath = buildRequiredAssignments(resolvedValues);

  for (const file of MANAGED_ENV_FILES) {
    const fileState = stateByPath.get(file.envPath);
    if (!fileState) {
      throw new Error(`Missing env state for ${file.envPath}`);
    }

    const requiredAssignments = {};
    for (const key of file.requiredKeys) {
      if (requiredAssignmentsByPath[file.envPath][key]) {
        requiredAssignments[key] = requiredAssignmentsByPath[file.envPath][key];
      }
    }

    await mkdir(path.dirname(fileState.absolutePath), { recursive: true });

    if (!fileState.exists) {
      const examplePath = path.resolve(rootDir, file.examplePath);
      const exampleContent = (await fileExists(examplePath))
        ? await readFile(examplePath, "utf8")
        : "";
      let output = applyRequiredKeys(exampleContent, requiredAssignments);
      if (output.length > 0 && !output.endsWith("\n")) {
        output += "\n";
      }

      await writeFile(fileState.absolutePath, output, "utf8");
      logger(`ensure-local-env: created ${file.envPath}`);
      continue;
    }

    const updated = appendOnlyMissingRequiredKeys(
      fileState.content,
      requiredAssignments,
      fileState.values
    );
    if (updated !== fileState.content) {
      await writeFile(fileState.absolutePath, updated, "utf8");
      logger(`ensure-local-env: updated ${file.envPath} (added missing keys)`);
    }
  }

  logger(
    `ensure-local-env: using WEB/API/POSTGRES ports ${resolvedValues.ports.WEB_PORT}/${resolvedValues.ports.API_PORT}/${resolvedValues.ports.POSTGRES_PORT}`
  );

  return resolvedValues;
}

function isExecutedDirectly() {
  if (!process.argv[1]) {
    return false;
  }

  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isExecutedDirectly()) {
  await ensureLocalEnv().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
