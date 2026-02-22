import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getHeadSha() {
  return process.env.HEAD_SHA?.trim() || process.env.GITHUB_SHA?.trim() || "local";
}

export function getTier() {
  return process.env.RISK_TIER?.trim() || "t3";
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

export async function writeArtifact(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function writeDeployArtifact(name, payload) {
  const artifactPath = path.join(".artifacts", "deploy", getHeadSha(), `${name}.json`);
  await writeArtifact(artifactPath, payload);
  return artifactPath;
}

export async function appendGithubOutput(values) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  await writeFile(outputPath, `${lines.join("\n")}\n`, { encoding: "utf8", flag: "a" });
}

export async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function pickRevisionWithTraffic(revisions) {
  if (!Array.isArray(revisions) || revisions.length === 0) {
    return null;
  }

  const weighted = revisions
    .map((revision) => ({
      name: revision.name,
      weight: Number(revision?.properties?.trafficWeight ?? revision?.trafficWeight ?? 0)
    }))
    .filter((revision) => revision.name && revision.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  if (weighted.length > 0) {
    return weighted[0].name;
  }

  const newest = revisions
    .map((revision) => ({
      name: revision.name,
      createdTime:
        revision?.properties?.createdTime ||
        revision?.properties?.lastTransitionTime ||
        revision?.createdTime ||
        ""
    }))
    .filter((revision) => Boolean(revision.name))
    .sort((a, b) => String(b.createdTime).localeCompare(String(a.createdTime)));

  return newest[0]?.name ?? null;
}

export function toHttpsUrl(fqdn) {
  if (!fqdn) {
    return null;
  }

  if (fqdn.startsWith("http://") || fqdn.startsWith("https://")) {
    return fqdn;
  }

  return `https://${fqdn}`;
}
