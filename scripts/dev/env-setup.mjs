import { access, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENV_TARGETS = [
  {
    envPath: "apps/api/.env",
    examplePath: "apps/api/.env.example"
  },
  {
    envPath: "apps/web/.env",
    examplePath: "apps/web/.env.example"
  },
  {
    envPath: "db/postgres/.env",
    examplePath: "db/postgres/.env.example"
  }
];

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureEnvSetup({ rootDir = process.cwd(), logger = console.info } = {}) {
  const created = [];

  for (const target of ENV_TARGETS) {
    const envPath = path.resolve(rootDir, target.envPath);
    const examplePath = path.resolve(rootDir, target.examplePath);

    if (await exists(envPath)) {
      continue;
    }

    const hasExample = await exists(examplePath);
    if (!hasExample) {
      throw new Error(`Missing required env example: ${target.examplePath}`);
    }

    await mkdir(path.dirname(envPath), { recursive: true });
    await copyFile(examplePath, envPath);
    created.push(target.envPath);
  }

  if (created.length === 0) {
    logger("env:setup: all service .env files already exist");
    return { created };
  }

  logger(`env:setup: created ${created.join(", ")}`);
  return { created };
}

function isExecutedDirectly() {
  if (!process.argv[1]) {
    return false;
  }

  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isExecutedDirectly()) {
  await ensureEnvSetup().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
