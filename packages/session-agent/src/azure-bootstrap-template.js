(async () => {
  const { spawn } = require("node:child_process");
  const { access, copyFile, mkdir, readFile, writeFile } = require("node:fs/promises");
  const { constants: fsConstants, openSync } = require("node:fs");
  const path = require("node:path");

  const WORK_DIR = __WORK_DIR__;
  const AGENT_SOURCE_FILE = __AGENT_SOURCE_FILE__;
  const ECHO_SOURCE_FILE = __ECHO_SOURCE_FILE__;
  const SESSION_IDENTIFIER = __SESSION_IDENTIFIER__;
  const BOOT_ID = __BOOT_ID__;
  const CONNECT_TOKEN = __CONNECT_TOKEN__;
  const CONTROL_PLANE_URL = __CONTROL_PLANE_URL__;
  const FORCE_RESTART = __FORCE_RESTART__;
  const WS_VERSION = __WS_VERSION__;

  const LOG_DIR = path.join(WORK_DIR, "logs");
  const STATE_DIR = path.join(WORK_DIR, "state");
  const AGENT_TARGET_FILE = path.join(WORK_DIR, "agent.js");
  const ECHO_TARGET_FILE = path.join(WORK_DIR, "echo-runtime.js");
  const PID_FILE = path.join(STATE_DIR, "agent.pid");
  const BOOT_FILE = path.join(STATE_DIR, "boot.json");
  const LOG_FILE = path.join(LOG_DIR, "agent.log");
  const WS_PACKAGE_FILE = path.join(WORK_DIR, "node_modules", "ws", "package.json");

  async function pathExists(targetPath) {
    try {
      await access(targetPath, fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  function isProcessAlive(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return error?.code === "EPERM";
    }
  }

  async function readPid() {
    if (!(await pathExists(PID_FILE))) {
      return null;
    }

    const raw = (await readFile(PID_FILE, "utf8")).trim();
    const pid = Number.parseInt(raw, 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  }

  async function runCommand(command, args) {
    await new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: WORK_DIR,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"]
      });

      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });

      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(stderr.trim() || `${command} exited with code ${String(code)}`));
      });
    });
  }

  async function ensureRuntimeFiles() {
    await mkdir(LOG_DIR, { recursive: true });
    await mkdir(STATE_DIR, { recursive: true });
    await copyFile(AGENT_SOURCE_FILE, AGENT_TARGET_FILE);
    await copyFile(ECHO_SOURCE_FILE, ECHO_TARGET_FILE);
  }

  async function ensureWsInstalled() {
    if (await pathExists(WS_PACKAGE_FILE)) {
      return;
    }

    await runCommand(process.platform === "win32" ? "npm.cmd" : "npm", [
      "install",
      `ws@${WS_VERSION}`,
      "--prefix",
      WORK_DIR,
      "--no-audit",
      "--no-fund"
    ]);
  }

  async function terminateExistingProcess(pid) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      return;
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt < 5_000) {
      if (!isProcessAlive(pid)) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async function startAgent() {
    const stdoutFd = openSync(LOG_FILE, "a");
    const stderrFd = openSync(LOG_FILE, "a");
    const child = spawn(process.execPath, [AGENT_TARGET_FILE], {
      cwd: WORK_DIR,
      detached: true,
      stdio: ["ignore", stdoutFd, stderrFd],
      env: {
        ...process.env,
        COMPASS_CONTROL_PLANE_URL: CONTROL_PLANE_URL,
        COMPASS_CONNECT_TOKEN: CONNECT_TOKEN,
        COMPASS_SESSION_IDENTIFIER: SESSION_IDENTIFIER,
        COMPASS_BOOT_ID: BOOT_ID
      }
    });
    child.unref();

    await writeFile(PID_FILE, `${String(child.pid)}\n`, "utf8");
    await writeFile(
      BOOT_FILE,
      JSON.stringify(
        {
          sessionIdentifier: SESSION_IDENTIFIER,
          bootId: BOOT_ID,
          pid: child.pid,
          startedAt: new Date().toISOString()
        },
        null,
        2
      ),
      "utf8"
    );

    return child.pid ?? null;
  }

  await ensureRuntimeFiles();
  await ensureWsInstalled();

  const existingPid = await readPid();
  if (existingPid && isProcessAlive(existingPid)) {
    if (!FORCE_RESTART) {
      console.log(JSON.stringify({ status: "already-running", pid: existingPid }));
      process.exit(0);
    }

    await terminateExistingProcess(existingPid);
  }

  const pid = await startAgent();
  console.log(
    JSON.stringify({
      status: FORCE_RESTART ? "restarted" : "started",
      pid
    })
  );
})().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
