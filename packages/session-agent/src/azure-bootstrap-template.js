const { spawn } = require("node:child_process");

const AGENT_SOURCE_FILE = __AGENT_SOURCE_FILE__;
const SESSION_IDENTIFIER = __SESSION_IDENTIFIER__;
const BOOT_ID = __BOOT_ID__;
const CONNECT_TOKEN = __CONNECT_TOKEN__;
const CONTROL_PLANE_URL = __CONTROL_PLANE_URL__;
const FORCE_RESTART = __FORCE_RESTART__;

try {
  const child = spawn(process.execPath, [AGENT_SOURCE_FILE], {
    cwd: "/mnt/data",
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      COMPASS_CONTROL_PLANE_URL: CONTROL_PLANE_URL,
      COMPASS_CONNECT_TOKEN: CONNECT_TOKEN,
      COMPASS_SESSION_IDENTIFIER: SESSION_IDENTIFIER,
      COMPASS_BOOT_ID: BOOT_ID
    }
  });
  child.unref();

  console.log(
    JSON.stringify({
      status: FORCE_RESTART ? "restarted" : "started",
      pid: child.pid ?? null
    })
  );
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
}
