import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GIT_CONTEXT_ENV_KEYS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR"
];

function getGitExecEnv() {
  const env = { ...process.env };
  for (const key of GIT_CONTEXT_ENV_KEYS) {
    delete env[key];
  }
  return env;
}

export function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

export async function execGit(args) {
  const { stdout } = await execFileAsync("git", args, {
    encoding: "utf8",
    env: getGitExecEnv()
  });
  return stdout.trim();
}

export async function getCurrentSha() {
  return await execGit(["rev-parse", "HEAD"]);
}

export async function getParentSha(headSha) {
  return await execGit(["rev-parse", `${headSha}^`]);
}

function parseNameOnlyOutput(stdout) {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort();
}

function isMissingSymmetricBaseError(error) {
  const stderr = String(error?.stderr ?? "");
  return (
    stderr.includes("Invalid symmetric difference expression") ||
    stderr.includes("bad revision") ||
    stderr.includes("unknown revision or path not in the working tree")
  );
}

export async function getChangedFiles(baseSha, headSha) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--name-only", `${baseSha}...${headSha}`],
      {
        encoding: "utf8",
        env: getGitExecEnv()
      }
    );

    return parseNameOnlyOutput(stdout);
  } catch (error) {
    if (!isMissingSymmetricBaseError(error)) {
      throw error;
    }

    // Force-push rewrites can remove the previous push SHA from local history.
    // Fall back to the files touched by the tested commit so scope resolution remains deterministic.
    const { stdout } = await execFileAsync(
      "git",
      ["show", "--pretty=format:", "--name-only", headSha],
      {
        encoding: "utf8",
        env: getGitExecEnv()
      }
    );

    return parseNameOnlyOutput(stdout);
  }
}

export function matchesAnyPattern(filePath, patterns) {
  const normalizedPath = filePath.replaceAll("\\", "/");
  return patterns.some((pattern) => path.posix.matchesGlob(normalizedPath, pattern));
}

export async function readJsonFile(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function writeJsonFile(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function appendGithubOutput(values) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  await writeFile(outputPath, `${lines.join("\n")}\n`, { encoding: "utf8", flag: "a" });
}

export async function appendGithubStepSummary(markdown) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }

  await writeFile(summaryPath, `${markdown}\n`, { encoding: "utf8", flag: "a" });
}

export async function getPrNumberFromEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    return null;
  }

  const payload = await readJsonFile(eventPath);
  return payload?.pull_request?.number ?? payload?.number ?? null;
}

export function parseJsonEnv(name, fallback = null) {
  const raw = process.env[name];
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }

  return JSON.parse(raw);
}

export function parsePossiblyFencedJson(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) {
    return JSON.parse(trimmed);
  }

  const withoutFenceStart = trimmed.replace(/^```(?:json)?\s*/i, "");
  const withoutFenceEnd = withoutFenceStart.replace(/\s*```\s*$/i, "");
  return JSON.parse(withoutFenceEnd);
}
