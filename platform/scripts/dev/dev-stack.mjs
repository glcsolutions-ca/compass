import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { mkdir, open, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { ensureEnvSetup } from "./env-setup.mjs";
import { resolveLocalDevEnv } from "./local-env.mjs";

const ARTIFACTS_DIR = ".artifacts/dev";
const LOCK_PATH = path.join(ARTIFACTS_DIR, "dev-stack.lock.json");
const DEV_APPS_LOG_PATH = path.join(ARTIFACTS_DIR, "dev-apps.log");
const TURBO_DEV_ARGS = [
  "run",
  "dev",
  "--parallel",
  "--filter=@compass/api",
  "--filter=@compass/web"
];
const require = createRequire(import.meta.url);

function nowIso() {
  return new Date().toISOString();
}

function runCommand(command, args, cwd, { allowFailure = false, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0 || allowFailure) {
        resolve();
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

function resolveTurboBinarySpecifier() {
  const platform = process.platform === "win32" ? "windows" : process.platform;
  const arch = process.arch === "x64" ? "64" : process.arch;
  const supportedPlatforms = new Set(["darwin", "linux", "windows"]);
  const supportedArch = new Set(["64", "arm64"]);

  if (!supportedPlatforms.has(platform) || !supportedArch.has(arch)) {
    return null;
  }

  const extension = platform === "windows" ? ".exe" : "";
  return `turbo-${platform}-${arch}/bin/turbo${extension}`;
}

async function resolveTurboCommand(rootDir) {
  const turboBinarySpecifier = resolveTurboBinarySpecifier();
  if (turboBinarySpecifier) {
    try {
      return require.resolve(turboBinarySpecifier);
    } catch {
      // fall through
    }
  }

  const localTurboBin =
    process.platform === "win32"
      ? path.resolve(rootDir, "node_modules/.bin/turbo.cmd")
      : path.resolve(rootDir, "node_modules/.bin/turbo");

  if (await pathExists(localTurboBin)) {
    return localTurboBin;
  }

  return "turbo";
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
  await runCommand(
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

  await runCommand(
    process.execPath,
    [path.resolve(rootDir, "packages/database/scripts/check-migration-policy.mjs")],
    rootDir,
    { env }
  );

  await runCommand(
    process.execPath,
    [path.resolve(rootDir, "packages/database/scripts/migrate.mjs"), "up"],
    rootDir,
    {
      env
    }
  );

  await runCommand(
    process.execPath,
    [path.resolve(rootDir, "packages/database/scripts/seed-postgres.mjs")],
    rootDir,
    {
      env
    }
  );
}

async function waitForHttpHealth(url, timeoutMs = 30_000) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError ?? "unknown");
  throw new Error(`Health check failed for ${url}: ${reason}`);
}

async function waitForStackHealth(env) {
  const apiPort = env.API_PORT;
  const webPort = env.WEB_PORT;

  await waitForHttpHealth(`http://127.0.0.1:${apiPort}/health`);
  await waitForHttpHealth(`http://127.0.0.1:${webPort}/health`);
}

async function down(rootDir, env) {
  const lock = await readLock(rootDir);
  const lockOwnerPid = Number(lock?.ownerPid);
  const isDetachedOwner = lock?.mode === "up";
  const shouldKillDetachedOwner =
    isDetachedOwner && Number.isInteger(lockOwnerPid) && lockOwnerPid > 0;

  if (shouldKillDetachedOwner) {
    await killProcessGroupIfRunning(lockOwnerPid, { timeoutMs: 15_000 }).catch(() => {});
    await killPidIfRunning(lockOwnerPid, { timeoutMs: 15_000 }).catch(() => {});
  }

  await runCommand(
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

function launchTurboDev(rootDir, env, turboCommand) {
  return new Promise((resolve, reject) => {
    const child = spawn(turboCommand, TURBO_DEV_ARGS, {
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

      if (typeof code === "number") {
        resolve(code);
        return;
      }

      if (signal === "SIGINT") {
        resolve(130);
        return;
      }

      if (signal === "SIGTERM") {
        resolve(143);
        return;
      }

      resolve(1);
    });
  });
}

async function launchTurboDevDetached(rootDir, env, turboCommand) {
  await ensureArtifactsDir(rootDir);
  const logPath = path.resolve(rootDir, DEV_APPS_LOG_PATH);
  const logHandle = await open(
    logPath,
    fsConstants.O_CREAT | fsConstants.O_APPEND | fsConstants.O_WRONLY
  );

  const child = spawn(turboCommand, TURBO_DEV_ARGS, {
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

async function resolveRuntimeEnv(rootDir) {
  await ensureEnvSetup({ rootDir });
  const resolved = await resolveLocalDevEnv({
    rootDir,
    env: process.env
  });

  return {
    ports: resolved.ports,
    env: {
      ...process.env,
      ...resolved.env
    }
  };
}

async function run(rootDir) {
  await clearStaleLockIfNeeded(rootDir);
  const turboCommand = await resolveTurboCommand(rootDir);
  const { env, ports } = await resolveRuntimeEnv(rootDir);
  await writeLock(rootDir, {
    mode: "run",
    ownerPid: process.pid,
    startedAt: nowIso(),
    ports,
    appLogPath: null
  });

  let turboExitCode = 1;
  let cleanupError = null;

  try {
    await startDependencies(rootDir, env);
    console.info("dev-stack: dependencies are ready.");
    turboExitCode = await launchTurboDev(rootDir, env, turboCommand);
  } finally {
    try {
      await down(rootDir, env);
    } catch (error) {
      cleanupError = error;
      console.error(error instanceof Error ? error.message : String(error));
    }
  }

  process.exitCode = cleanupError && turboExitCode === 0 ? 1 : turboExitCode;
}

async function up(rootDir) {
  await clearStaleLockIfNeeded(rootDir);
  const turboCommand = await resolveTurboCommand(rootDir);
  const { env, ports } = await resolveRuntimeEnv(rootDir);

  let appsPid = null;
  try {
    await startDependencies(rootDir, env);
    console.info("dev-stack: dependencies are ready.");

    const detached = await launchTurboDevDetached(rootDir, env, turboCommand);
    appsPid = detached.pid;
    await writeLock(rootDir, {
      mode: "up",
      ownerPid: appsPid,
      startedAt: nowIso(),
      ports,
      appLogPath: detached.appLogPath
    });

    await waitForStackHealth(env);
    console.info(
      `dev-stack: full stack is up in background (pid=${String(appsPid)}). Logs: ${detached.appLogPath}`
    );
  } catch (error) {
    if (Number.isInteger(appsPid) && appsPid > 0) {
      await killPidIfRunning(appsPid).catch(() => {});
    }
    await down(rootDir, env).catch(() => {});
    throw error;
  }
}

async function main() {
  const action = process.argv[2];
  const rootDir = process.cwd();

  if (!action || !["run", "up", "down"].includes(action)) {
    console.error("Usage: node platform/scripts/dev/dev-stack.mjs <run|up|down>");
    process.exitCode = 1;
    return;
  }

  if (action === "run") {
    await run(rootDir);
    return;
  }

  if (action === "up") {
    await up(rootDir);
    return;
  }

  await ensureEnvSetup({ rootDir });
  await down(rootDir, process.env);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
