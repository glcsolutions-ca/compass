import { pathToFileURL } from "node:url";
import { parseCliArgs } from "./cli-utils.mjs";

function collectRequired(options) {
  const value = options.required;
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    return [value];
  }
  return [];
}

export function assertEnvironmentConfig(requiredKeys, env = process.env) {
  const missing = [];

  for (const key of requiredKeys) {
    const normalized = String(key || "").trim();
    if (!normalized) {
      continue;
    }

    if (!env[normalized] || String(env[normalized]).trim().length === 0) {
      missing.push(normalized);
    }
  }

  if (missing.length > 0) {
    const message = missing.map((key) => `- ${key}`).join("\n");
    throw new Error(`Missing required environment configuration:\n${message}`);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const required = collectRequired(options);

  if (required.length === 0) {
    throw new Error("At least one --required <ENV_KEY> option is required");
  }

  assertEnvironmentConfig(required);
  console.info(`Environment configuration assertion passed for ${required.length} key(s).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
