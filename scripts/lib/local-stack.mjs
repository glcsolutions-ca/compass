import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { mkdir, open, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureEnvSetup } from "../env-setup.mjs";
import { resolveLocalDevEnv } from "./local-env.mjs";

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARTIFACTS_DIR = ".artifacts/dev";
const LOCK_PATH = path.join(ARTIFACTS_DIR, "dev-stack.lock.json");
const DEV_APPS_LOG_PATH = path.join(ARTIFACTS_DIR, "dev-apps.log");
const DEV_APPS_RUNNER_PATH = path.resolve(ROOT_DIR, "scripts/lib/run-apps.mjs");

function nowIso() {
  return new Date().toISOString();
}

function createAbortError() {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function mapExitCode(code, signal) {
  if (typeof code === "number") {
    return code;
  }

  if (signal === "SIGINT") {
    return 130;
  }

  if (signal === "SIGTERM") {
    return 143;
  }

  return 1;
}

export function pnpmCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

export function runCommand(command, args, { cwd = ROOT_DIR, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env
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

function runWorkspaceCommand(command, args, cwd, { allowFailure = false, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0 || allowFailure) {
        resolve(undefined);
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${String(code)}`));
    });
  });
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
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

async function isProcessGroupRunning(pgid) {
  if (process.platform === "win32" || !Number.isInteger(pgid) || pgid < 1) {
    return false;
  }

  try {
    process.kill(-pgid, 0);
    return true;
  } catch {
    return false;
  }
}

async function ensureArtifactsDir(rootDir) {
  await mkdir(path.resolve(rootDir, ARTIFACTS_DIR), { recursive: true });
}

async function readLock(rootDir) {
  const lockPath = path.resolve(rootDir, LOCK_PATH);
  if (!(await pathExists(lockPath))) {
    return null;
  }

  const raw = await readFile(lockPath, "utf8");
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

async function writeLock(rootDir, lock) {
  await ensureArtifactsDir(rootDir);
  await writeFile(path.resolve(rootDir, LOCK_PATH), `${JSON.stringify(lock, null, 2)}\n`, "utf8");
}

async function removeLock(rootDir) {
  await unlink(path.resolve(rootDir, LOCK_PATH)).catch(() => {});
}

async function clearStaleLockIfNeeded(rootDir) {
  const lock = await readLock(rootDir);
  if (!lock) {
    return;
  }

  const ownerPid = Number(lock.ownerPid);
  const ownerStillRunning =
    lock.mode === "up" ? await isProcessGroupRunning(ownerPid) : await isPidRunning(ownerPid);

  if (ownerStillRunning) {
    throw new Error(
      `dev-stack is already running (mode=${String(lock.mode)}, pid=${String(ownerPid)}). Run 'pnpm dev:down' first.`
    );
  }

  await removeLock(rootDir);
}

async function killPidIfRunning(pid, { timeoutMs = 10_000 } = {}) {
  if (!(await isPidRunning(pid))) {
    return;
  }

  process.kill(pid, "SIGTERM");
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!(await isPidRunning(pid))) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  if (await isPidRunning(pid)) {
    process.kill(pid, "SIGKILL");
  }
}

async function killProcessGroupIfRunning(pgid, { timeoutMs = 10_000 } = {}) {
  if (process.platform === "win32" || !Number.isInteger(pgid) || pgid < 1) {
    return;
  }

  if (!(await isProcessGroupRunning(pgid))) {
    return;
  }

  process.kill(-pgid, "SIGTERM");
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!(await isProcessGroupRunning(pgid))) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  if (await isProcessGroupRunning(pgid)) {
    process.kill(-pgid, "SIGKILL");
  }
}

async function startDependencies(rootDir, env) {
  await runWorkspaceCommand(
    process.execPath,
    [
      path.resolve(rootDir, "packages/database/scripts/postgres-compose.mjs"),
      "up",
      "-d",
      "--wait",
      "postgres"
    ],
    rootDir,
    {
      env
    }
  );

  await runWorkspaceCommand(
    process.execPath,
    [path.resolve(rootDir, "packages/database/scripts/check-migration-policy.mjs")],
    rootDir,
    { env }
  );

  await runWorkspaceCommand(
    process.execPath,
    [path.resolve(rootDir, "packages/database/scripts/migrate.mjs"), "up"],
    rootDir,
    {
      env
    }
  );

  await runWorkspaceCommand(
    process.execPath,
    [path.resolve(rootDir, "packages/database/scripts/seed-postgres.mjs")],
    rootDir,
    {
      env
    }
  );
}

function launchAppStack(rootDir, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [DEV_APPS_RUNNER_PATH], {
      cwd: rootDir,
      stdio: "inherit",
      env
    });

    const forwardSignal = (signal) => {
      if (!child.killed) {
        child.kill(signal);
      }
    };

    const onSigint = () => forwardSignal("SIGINT");
    const onSigterm = () => forwardSignal("SIGTERM");
    process.on("SIGINT", onSigint);
    process.on("SIGTERM", onSigterm);

    child.once("error", (error) => {
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
      reject(error);
    });

    child.once("exit", (code, signal) => {
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
      resolve(mapExitCode(code, signal));
    });
  });
}

async function launchAppStackDetached(rootDir, env) {
  await ensureArtifactsDir(rootDir);
  const logPath = path.resolve(rootDir, DEV_APPS_LOG_PATH);
  const logHandle = await open(
    logPath,
    fsConstants.O_CREAT | fsConstants.O_APPEND | fsConstants.O_WRONLY
  );

  const child = spawn(process.execPath, [DEV_APPS_RUNNER_PATH], {
    cwd: rootDir,
    detached: true,
    stdio: ["ignore", logHandle.fd, logHandle.fd],
    env
  });
  child.unref();
  await logHandle.close();

  return {
    pid: child.pid,
    appLogPath: DEV_APPS_LOG_PATH
  };
}

export async function resolveLocalRuntimeEnv({
  rootDir = ROOT_DIR,
  env = process.env,
  extraEnv = {}
} = {}) {
  await ensureEnvSetup({ rootDir });
  const resolved = await resolveLocalDevEnv({ rootDir, env });

  return {
    ports: resolved.ports,
    env: {
      ...env,
      ...resolved.env,
      ...extraEnv
    }
  };
}

export async function isHealthy(url, { signal } = {}) {
  try {
    const response = await fetch(url, { signal });
    return response.ok;
  } catch {
    if (signal?.aborted) {
      throw createAbortError();
    }

    return false;
  }
}

export async function waitForHttpHealth(url, timeoutMs = 30_000, { signal } = {}) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    throwIfAborted(signal);

    try {
      const response = await fetch(url, { signal });
      if (response.ok) {
        return;
      }

      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (signal?.aborted) {
        throw createAbortError();
      }

      lastError = error;
    }

    await delay(250, signal);
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError ?? "unknown");
  throw new Error(`Health check failed for ${url}: ${reason}`);
}

export async function waitForLocalStackHealth(env, { timeoutMs = 30_000, signal } = {}) {
  const apiHealthUrl = `${env.VITE_API_BASE_URL.replace(/\/$/, "")}/health`;
  const webHealthUrl = `${env.WEB_BASE_URL.replace(/\/$/, "")}/health`;

  await waitForHttpHealth(apiHealthUrl, timeoutMs, { signal });
  await waitForHttpHealth(webHealthUrl, timeoutMs, { signal });
}

export async function ensureLocalStack({
  rootDir = ROOT_DIR,
  env,
  timeoutMs = 30_000
} = {}) {
  const runtime = env ? { env } : await resolveLocalRuntimeEnv({ rootDir });

  const apiHealthUrl = `${runtime.env.VITE_API_BASE_URL.replace(/\/$/, "")}/health`;
  const webHealthUrl = `${runtime.env.WEB_BASE_URL.replace(/\/$/, "")}/health`;

  if ((await isHealthy(apiHealthUrl)) && (await isHealthy(webHealthUrl))) {
    return {
      env: runtime.env,
      reused: true
    };
  }

  await upLocalStack({ rootDir, env: runtime.env });
  await waitForLocalStackHealth(runtime.env, { timeoutMs });

  return {
    env: runtime.env,
    reused: false
  };
}

export async function downLocalStack({ rootDir = ROOT_DIR, env = process.env } = {}) {
  await ensureEnvSetup({ rootDir });

  const lock = await readLock(rootDir);
  const lockOwnerPid = Number(lock?.ownerPid);
  const isDetachedOwner = lock?.mode === "up";
  const shouldKillDetachedOwner =
    isDetachedOwner && Number.isInteger(lockOwnerPid) && lockOwnerPid > 0;

  if (shouldKillDetachedOwner) {
    await killProcessGroupIfRunning(lockOwnerPid, { timeoutMs: 15_000 }).catch(() => {});
    await killPidIfRunning(lockOwnerPid, { timeoutMs: 15_000 }).catch(() => {});
  }

  await runWorkspaceCommand(
    process.execPath,
    [path.resolve(rootDir, "packages/database/scripts/postgres-compose.mjs"), "down"],
    rootDir,
    {
      allowFailure: true,
      env
    }
  );

  await removeLock(rootDir);
  console.info("dev-stack: dependencies are down.");
}

export async function runLocalStack({ rootDir = ROOT_DIR, env = process.env } = {}) {
  await clearStaleLockIfNeeded(rootDir);
  const runtime = await resolveLocalRuntimeEnv({ rootDir, env });
  await writeLock(rootDir, {
    mode: "run",
    ownerPid: process.pid,
    startedAt: nowIso(),
    ports: runtime.ports,
    appLogPath: null
  });

  let appsExitCode = 1;
  let cleanupError = null;

  try {
    await startDependencies(rootDir, runtime.env);
    console.info("dev-stack: dependencies are ready.");
    appsExitCode = await launchAppStack(rootDir, runtime.env);
  } finally {
    try {
      await downLocalStack({ rootDir, env: runtime.env });
    } catch (error) {
      cleanupError = error;
      console.error(error instanceof Error ? error.message : String(error));
    }
  }

  return cleanupError && appsExitCode === 0 ? 1 : appsExitCode;
}

export async function upLocalStack({ rootDir = ROOT_DIR, env = process.env } = {}) {
  await clearStaleLockIfNeeded(rootDir);
  const runtime = await resolveLocalRuntimeEnv({ rootDir, env });

  let appsPid = null;
  try {
    await startDependencies(rootDir, runtime.env);
    console.info("dev-stack: dependencies are ready.");

    const detached = await launchAppStackDetached(rootDir, runtime.env);
    appsPid = detached.pid;
    await writeLock(rootDir, {
      mode: "up",
      ownerPid: appsPid,
      startedAt: nowIso(),
      ports: runtime.ports,
      appLogPath: detached.appLogPath
    });

    await waitForLocalStackHealth(runtime.env);
    console.info(
      `dev-stack: full stack is up in background (pid=${String(appsPid)}). Logs: ${detached.appLogPath}`
    );
  } catch (error) {
    if (Number.isInteger(appsPid) && appsPid > 0) {
      await killPidIfRunning(appsPid).catch(() => {});
    }
    await downLocalStack({ rootDir, env: runtime.env }).catch(() => {});
    throw error;
  }
}
