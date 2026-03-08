import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const pnpmExecutable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function spawnWorkspaceProcess(args) {
  return spawn(pnpmExecutable, args, {
    cwd: ROOT_DIR,
    stdio: "inherit",
    env: process.env
  });
}

const processes = [
  {
    name: "api",
    child: spawnWorkspaceProcess(["--filter", "@compass/api", "dev"])
  },
  {
    name: "web",
    child: spawnWorkspaceProcess(["--filter", "@compass/web", "dev"])
  }
];

let settling = false;

function killRemainingChildren(signal) {
  for (const entry of processes) {
    if (!entry.child.killed) {
      entry.child.kill(signal);
    }
  }
}

function finalize(code) {
  if (settling) {
    return;
  }

  settling = true;
  killRemainingChildren("SIGTERM");
  setTimeout(() => {
    killRemainingChildren("SIGKILL");
  }, 5_000).unref();
  process.exitCode = code;
}

process.on("SIGINT", () => {
  finalize(130);
});

process.on("SIGTERM", () => {
  finalize(143);
});

for (const entry of processes) {
  entry.child.once("error", (error) => {
    console.error(`${entry.name} dev process failed to start: ${error.message}`);
    finalize(1);
  });

  entry.child.once("exit", (code, signal) => {
    if (settling) {
      return;
    }

    if (typeof code === "number") {
      console.error(`${entry.name} dev process exited with code ${String(code)}`);
      finalize(code === 0 ? 1 : code);
      return;
    }

    if (signal === "SIGINT") {
      finalize(130);
      return;
    }

    if (signal === "SIGTERM") {
      finalize(143);
      return;
    }

    console.error(`${entry.name} dev process exited unexpectedly.`);
    finalize(1);
  });
}
