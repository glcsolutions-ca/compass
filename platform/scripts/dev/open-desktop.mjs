import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureEnvSetup } from "./env-setup.mjs";
import { resolveLocalDevEnv } from "./local-env.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..", "..", "..");

function pnpmCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function runCommand(command, args, { env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      stdio: "inherit",
      env: env ?? process.env
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${String(code)}`));
    });
  });
}

async function isHealthy(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureLocalStack(env) {
  const apiHealthUrl = `${env.VITE_API_BASE_URL.replace(/\/$/, "")}/health`;
  const webHealthUrl = `${env.WEB_BASE_URL.replace(/\/$/, "")}/health`;
  const apiReady = await isHealthy(apiHealthUrl);
  const webReady = await isHealthy(webHealthUrl);

  if (apiReady && webReady) {
    console.info("desktop: reusing running local web/api stack.");
    return;
  }

  console.info("desktop: starting local web/api stack.");
  await runCommand(
    process.execPath,
    [path.resolve(ROOT_DIR, "platform/scripts/dev/dev-stack.mjs"), "up"],
    {
      env
    }
  );
}

async function main() {
  await ensureEnvSetup({ rootDir: ROOT_DIR });
  const resolved = await resolveLocalDevEnv({ rootDir: ROOT_DIR });
  const env = {
    ...process.env,
    ...resolved.env,
    COMPASS_WEB_URL: resolved.env.WEB_BASE_URL
  };

  await ensureLocalStack(env);
  await runCommand(pnpmCommand(), ["--filter", "@compass/desktop", "dev"], { env });
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
