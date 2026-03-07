import { spawn } from "node:child_process";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type {
  SessionHost,
  BootstrapSessionAgentInput,
  BootstrapSessionAgentResult
} from "../../modules/runtime/session-host.js";

const require = createRequire(import.meta.url);

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath, "utf8");
    return true;
  } catch {
    return false;
  }
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readPid(pidPath: string): Promise<number | null> {
  if (!(await pathExists(pidPath))) {
    return null;
  }

  const raw = await readFile(pidPath, "utf8");
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export class LocalProcessSessionHost implements SessionHost {
  readonly executionHost = "desktop_local";
  readonly requiresPublicControlPlaneUrl = false;
  readonly #workRoot: string;
  readonly #sessionAgentPath: string;

  constructor(input: { workRoot: string }) {
    this.#workRoot = input.workRoot;
    this.#sessionAgentPath = require.resolve("@compass/runtime-agent/cli");
  }

  async bootstrapSessionAgent(
    input: BootstrapSessionAgentInput
  ): Promise<BootstrapSessionAgentResult> {
    const sessionWorkDir = path.join(this.#workRoot, input.sessionIdentifier);
    const logPath = path.join(sessionWorkDir, "agent.log");
    const pidPath = path.join(sessionWorkDir, "agent.pid");
    const bootPath = path.join(sessionWorkDir, "boot.json");

    await mkdir(sessionWorkDir, { recursive: true });

    const existingPid = await readPid(pidPath);
    if (existingPid && isPidRunning(existingPid)) {
      if (!input.forceRestart) {
        return {
          status: "already-running",
          pid: existingPid
        };
      }

      try {
        process.kill(existingPid, "SIGTERM");
      } catch {
        // ignore cleanup failures
      }
    }

    const out = await open(
      logPath,
      fsConstants.O_CREAT | fsConstants.O_APPEND | fsConstants.O_WRONLY
    );
    const child = spawn(process.execPath, [this.#sessionAgentPath], {
      cwd: sessionWorkDir,
      detached: true,
      stdio: ["ignore", out.fd, out.fd],
      env: {
        ...process.env,
        COMPASS_CONTROL_PLANE_URL: input.controlPlaneUrl,
        COMPASS_CONNECT_TOKEN: input.connectToken,
        COMPASS_SESSION_IDENTIFIER: input.sessionIdentifier,
        COMPASS_BOOT_ID: input.bootId
      }
    });
    child.unref();
    await out.close();

    await writeFile(pidPath, `${String(child.pid)}\n`, "utf8");
    await writeFile(
      bootPath,
      `${JSON.stringify(
        {
          sessionIdentifier: input.sessionIdentifier,
          bootId: input.bootId,
          pid: child.pid,
          startedAt: new Date().toISOString()
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    return {
      status: input.forceRestart ? "restarted" : "started",
      pid: child.pid ?? null
    };
  }
}
