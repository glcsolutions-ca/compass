import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { loadProductionConfig } from "../infra/platform-config.mjs";

const execFileAsync = promisify(execFile);

async function gh(args) {
  const { stdout } = await execFileAsync("gh", args, {
    env: process.env,
    maxBuffer: 20 * 1024 * 1024
  });
  return String(stdout || "").trim();
}

export async function ensureGhcrVisibility() {
  const config = await loadProductionConfig();
  const owner = config.repository.split("/")[0];
  for (const packageName of config.ghcrPackages) {
    try {
      await gh([
        "api",
        "--method",
        "PATCH",
        `orgs/${owner}/packages/container/${packageName}/visibility`,
        "-f",
        "visibility=public"
      ]);
      console.info(`GHCR package made public: ${packageName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("HTTP 404")) {
        console.info(`GHCR package not found yet, skipping: ${packageName}`);
        continue;
      }
      throw error;
    }
  }
}

export async function main() {
  await ensureGhcrVisibility();
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
