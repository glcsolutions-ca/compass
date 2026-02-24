import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import {
  appendGithubOutput,
  requireEnv,
  writeJsonFile as writeArtifact
} from "../../shared/pipeline-utils.mjs";

const execFileAsync = promisify(execFile);
export { appendGithubOutput, requireEnv, writeArtifact };

export function getHeadSha() {
  return process.env.HEAD_SHA?.trim() || process.env.GITHUB_SHA?.trim() || "local";
}

export async function run(command, args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      ...options
    });

    return {
      stdout: stdout.trim(),
      stderr: stderr.trim()
    };
  } catch (error) {
    const stdout = error?.stdout ? String(error.stdout).trim() : "";
    const stderr = error?.stderr ? String(error.stderr).trim() : "";
    const details = [stdout, stderr].filter((value) => value.length > 0).join("\n");

    throw new Error(
      `${command} ${args.join(" ")} failed${details.length > 0 ? `\n${details}` : ""}`
    );
  }
}

export async function runJson(command, args, options = {}) {
  const { stdout } = await run(command, args, options);
  if (!stdout) {
    return null;
  }

  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(
      `Failed to parse JSON from '${command} ${args.join(" ")}': ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function writeDeployArtifact(name, payload) {
  const artifactPath = path.join(".artifacts", "deploy", getHeadSha(), `${name}.json`);
  await writeArtifact(artifactPath, payload);
  return artifactPath;
}

export async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
