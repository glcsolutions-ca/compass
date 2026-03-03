import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_BUFFER = 20 * 1024 * 1024;

function hasOutputArg(args) {
  return args.includes("-o") || args.includes("--output");
}

function normalizeError(error, args) {
  const stdout = String(error.stdout || "").trim();
  const stderr = String(error.stderr || "").trim();
  const details = [
    `az command failed: az ${args.join(" ")}`,
    stdout ? `stdout:\n${stdout}` : "",
    stderr ? `stderr:\n${stderr}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");

  const wrapped = new Error(details);
  wrapped.cause = error;
  return wrapped;
}

export async function runAz(args, { output = "json" } = {}) {
  const baseArgs = [...args];

  if (!baseArgs.includes("--only-show-errors")) {
    baseArgs.push("--only-show-errors");
  }

  if (!hasOutputArg(baseArgs)) {
    baseArgs.push("-o", output);
  }

  try {
    const { stdout } = await execFileAsync("az", baseArgs, {
      env: process.env,
      maxBuffer: DEFAULT_MAX_BUFFER
    });

    const normalized = String(stdout || "").trim();
    if (output === "json") {
      if (!normalized) {
        return {};
      }
      return JSON.parse(normalized);
    }

    return normalized;
  } catch (error) {
    throw normalizeError(error, baseArgs);
  }
}

export async function ensureAzLogin() {
  await runAz(["account", "show"]);
}
