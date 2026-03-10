import { spawn, spawnSync } from "node:child_process";

export async function runCommand(
  command,
  args,
  { cwd = process.cwd(), env = process.env, stdio = "inherit" } = {}
) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed (${code ?? "unknown"})`));
    });
  });
}

export function runCommandCapture(command, args, { cwd = process.cwd(), env = process.env } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  return {
    status: result.status ?? null,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || "")
  };
}

export function runCommandCaptureStrict(
  command,
  args,
  { cwd = process.cwd(), env = process.env } = {}
) {
  const result = runCommandCapture(command, args, { cwd, env });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status ?? "unknown"})\n${result.stderr || result.stdout}`
    );
  }
  return result.stdout.trim();
}
