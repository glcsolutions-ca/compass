import { access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { PACKAGE_ROOT_DIR, POSTGRES_DIR } from "./paths.mjs";

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const postgresEnvPath = path.join(POSTGRES_DIR, ".env");
  const postgresEnvLocalPath = path.join(POSTGRES_DIR, ".env.local");
  const composeFilePath = path.join(POSTGRES_DIR, "docker-compose.yml");

  const args = ["compose"];
  if (await exists(postgresEnvPath)) {
    args.push("--env-file", postgresEnvPath);
  }
  if (await exists(postgresEnvLocalPath)) {
    args.push("--env-file", postgresEnvLocalPath);
  }

  args.push("-f", composeFilePath, ...process.argv.slice(2));

  const child = spawn("docker", args, {
    cwd: PACKAGE_ROOT_DIR,
    stdio: "inherit",
    env: process.env
  });

  child.once("error", (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });

  child.once("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exitCode = code ?? 1;
  });
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
