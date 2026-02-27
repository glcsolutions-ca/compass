import { constants as fsConstants } from "node:fs";
import { mkdir, open, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { ensureLocalEnv } from "./ensure-local-env.mjs";

const ARTIFACTS_DIR = ".artifacts/dev";
const PID_PATH = path.join(ARTIFACTS_DIR, "runtime-session.pid");
const LOG_PATH = path.join(ARTIFACTS_DIR, "runtime-session.log");
const RUNTIME_ENV_PATH = "apps/codex-session-runtime/.env";
const RUNTIME_COMPOSE_FILE = "apps/codex-session-runtime/docker-compose.yml";

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

    const [, key, rawValue] = match;
    parsed[key] = rawValue.trim().replace(/^['"]|['"]$/gu, "");
  }

  return parsed;
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readRuntimeEnv(rootDir) {
  const envPath = path.resolve(rootDir, RUNTIME_ENV_PATH);
  const raw = await readFile(envPath, "utf8");
  return parseEnvText(raw);
}

function parseDriver(args) {
  const explicit = args.find((argument) => argument.startsWith("--driver="));
  if (!explicit) {
    return "process";
  }

  const candidate = explicit.split("=", 2)[1]?.trim().toLowerCase();
  return candidate === "docker" ? "docker" : "process";
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

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: process.env
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${String(code)}`));
    });
  });
}

async function upProcess(rootDir) {
  const envValues = await readRuntimeEnv(rootDir);
  const host = String(process.env.HOST || envValues.HOST || "127.0.0.1").trim() || "127.0.0.1";
  const port = String(process.env.PORT || envValues.PORT || "8080").trim() || "8080";
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
      ...envValues,
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

async function statusProcess(rootDir) {
  const envValues = await readRuntimeEnv(rootDir);
  const host = String(process.env.HOST || envValues.HOST || "127.0.0.1").trim() || "127.0.0.1";
  const port = String(process.env.PORT || envValues.PORT || "8080").trim() || "8080";
  const baseUrl = `http://${host}:${port}`;
  const pid = await readPid(rootDir);
  const running = pid ? await isPidRunning(pid) : false;

  if (!pid || !running) {
    console.info(`runtime:session status=stopped url=${baseUrl}`);
    return;
  }

  try {
    const healthResponse = await fetch(`${baseUrl}/health`);
    if (healthResponse.ok) {
      const payload = await healthResponse.json();
      const engine = typeof payload.engine === "string" ? payload.engine : "unknown";
      console.info(`runtime:session status=running pid=${pid} url=${baseUrl} engine=${engine}`);
      return;
    }
  } catch {
    // ignore probe errors and report degraded process state
  }

  console.info(`runtime:session status=degraded pid=${pid} url=${baseUrl}`);
}

async function logsProcess(rootDir) {
  const logPath = path.resolve(rootDir, LOG_PATH);
  if (!(await pathExists(logPath))) {
    console.info("runtime:session log file does not exist yet.");
    return;
  }

  await runCommand("tail", ["-n", "200", "-f", logPath], rootDir);
}

async function runDocker(rootDir, args) {
  await runCommand(
    "docker",
    [
      "compose",
      "--env-file",
      path.resolve(rootDir, RUNTIME_ENV_PATH),
      "-f",
      path.resolve(rootDir, RUNTIME_COMPOSE_FILE),
      ...args
    ],
    rootDir
  );
}

async function upDocker(rootDir) {
  await runDocker(rootDir, ["up", "-d", "runtime"]);
  const envValues = await readRuntimeEnv(rootDir);
  const port = String(process.env.PORT || envValues.PORT || "8080").trim() || "8080";
  await waitForHealth(`http://127.0.0.1:${port}`);
  console.info("runtime:session docker started.");
}

async function downDocker(rootDir) {
  await runDocker(rootDir, ["down"]);
}

async function statusDocker(rootDir) {
  await runDocker(rootDir, ["ps"]);
}

async function logsDocker(rootDir) {
  await runDocker(rootDir, ["logs", "-f", "runtime"]);
}

async function main() {
  const [action, ...restArgs] = process.argv.slice(2);
  const rootDir = process.cwd();
  const driver = parseDriver(restArgs);

  if (!action || !["up", "down", "reset", "status", "logs"].includes(action)) {
    console.error(
      "Usage: node scripts/dev/runtime-session.mjs <up|down|reset|status|logs> [--driver=process|docker]"
    );
    process.exitCode = 1;
    return;
  }

  await ensureLocalEnv({ rootDir });

  if (driver === "docker") {
    if (action === "up") {
      await upDocker(rootDir);
      return;
    }
    if (action === "down") {
      await downDocker(rootDir);
      return;
    }
    if (action === "reset") {
      await downDocker(rootDir);
      await upDocker(rootDir);
      return;
    }
    if (action === "status") {
      await statusDocker(rootDir);
      return;
    }
    if (action === "logs") {
      await logsDocker(rootDir);
      return;
    }
    return;
  }

  if (action === "up") {
    await upProcess(rootDir);
    return;
  }
  if (action === "down") {
    await downProcess(rootDir);
    return;
  }
  if (action === "reset") {
    await downProcess(rootDir);
    await upProcess(rootDir);
    return;
  }
  if (action === "status") {
    await statusProcess(rootDir);
    return;
  }
  if (action === "logs") {
    await logsProcess(rootDir);
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
