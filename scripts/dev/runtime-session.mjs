import { constants as fsConstants } from "node:fs";
import { mkdir, open, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { ensureEnvSetup } from "./env-setup.mjs";
import { mergeLayeredEnv, normalizeEnvValue, readEnvLayer } from "../shared/env-files.mjs";

const ARTIFACTS_DIR = ".artifacts/dev";
const PID_PATH = path.join(ARTIFACTS_DIR, "runtime-session.pid");
const LOG_PATH = path.join(ARTIFACTS_DIR, "runtime-session.log");
const RUNTIME_ENV_PATH = "apps/codex-session-runtime/.env";

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readRuntimeEnv(rootDir, processEnv = process.env) {
  const envPath = path.resolve(rootDir, RUNTIME_ENV_PATH);
  const layer = await readEnvLayer(envPath);

  const merged = mergeLayeredEnv({
    processEnv,
    envLocalValues: layer.envLocalValues,
    envValues: layer.envValues
  });

  const host = normalizeEnvValue(merged.HOST) ?? "127.0.0.1";
  const port =
    normalizeEnvValue(processEnv.SESSION_RUNTIME_PORT) ?? normalizeEnvValue(merged.PORT) ?? "8080";

  return {
    ...merged,
    HOST: host,
    PORT: port
  };
}

async function isPidRunning(pid) {
  if (!Number.isInteger(pid) || pid < 1) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readPid(rootDir) {
  const pidPath = path.resolve(rootDir, PID_PATH);
  if (!(await pathExists(pidPath))) {
    return null;
  }

  const raw = await readFile(pidPath, "utf8");
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

async function waitForHealth(baseUrl, timeoutMs = 12_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 120);
    });
  }

  throw new Error(`Runtime did not become healthy at ${baseUrl} within ${timeoutMs}ms`);
}

async function upProcess(rootDir, runtimeEnv) {
  const host = String(runtimeEnv.HOST || "127.0.0.1").trim() || "127.0.0.1";
  const port = String(runtimeEnv.PORT || "8080").trim() || "8080";
  const baseUrl = `http://${host}:${port}`;

  const existingPid = await readPid(rootDir);
  if (existingPid && (await isPidRunning(existingPid))) {
    console.info(`runtime:session is already running (pid=${existingPid}) ${baseUrl}`);
    return;
  }

  await mkdir(path.resolve(rootDir, ARTIFACTS_DIR), { recursive: true });
  const logPath = path.resolve(rootDir, LOG_PATH);
  const pidPath = path.resolve(rootDir, PID_PATH);

  const logHandle = await open(
    logPath,
    fsConstants.O_CREAT | fsConstants.O_APPEND | fsConstants.O_WRONLY
  );
  const child = spawn(process.execPath, ["apps/codex-session-runtime/server.mjs"], {
    cwd: rootDir,
    detached: true,
    stdio: ["ignore", logHandle.fd, logHandle.fd],
    env: {
      ...process.env,
      ...runtimeEnv,
      HOST: host,
      PORT: port
    }
  });
  child.unref();
  await logHandle.close();

  await writeFile(pidPath, `${child.pid}\n`, "utf8");

  try {
    await waitForHealth(baseUrl);
    console.info(`runtime:session started (pid=${child.pid}) ${baseUrl}`);
  } catch (error) {
    try {
      process.kill(child.pid, "SIGTERM");
    } catch {
      // ignore cleanup failures
    }
    await unlink(pidPath).catch(() => {});
    throw error;
  }
}

async function downProcess(rootDir) {
  const pidPath = path.resolve(rootDir, PID_PATH);
  const pid = await readPid(rootDir);
  if (!pid) {
    console.info("runtime:session is not running.");
    return;
  }

  if (!(await isPidRunning(pid))) {
    await unlink(pidPath).catch(() => {});
    console.info("runtime:session pid file was stale and has been cleaned up.");
    return;
  }

  process.kill(pid, "SIGTERM");
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    if (!(await isPidRunning(pid))) {
      break;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  if (await isPidRunning(pid)) {
    process.kill(pid, "SIGKILL");
  }

  await unlink(pidPath).catch(() => {});
  console.info(`runtime:session stopped (pid=${pid}).`);
}

async function main() {
  const action = process.argv[2];
  const rootDir = process.cwd();

  if (!action || !["up", "down"].includes(action)) {
    console.error("Usage: node scripts/dev/runtime-session.mjs <up|down>");
    process.exitCode = 1;
    return;
  }

  await ensureEnvSetup({ rootDir });

  if (action === "down") {
    await downProcess(rootDir);
    return;
  }

  const runtimeEnv = await readRuntimeEnv(rootDir, process.env);
  await upProcess(rootDir, runtimeEnv);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
