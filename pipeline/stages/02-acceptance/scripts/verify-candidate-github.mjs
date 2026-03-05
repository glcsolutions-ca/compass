import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { parseCliArgs, optionalOption, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import { readJsonFile } from "../../../shared/scripts/pipeline-contract-lib.mjs";
import { validateReleaseCandidateFile } from "../../../shared/scripts/validate-release-candidate.mjs";

const execFileAsync = promisify(execFile);
const REQUEST_TIMEOUT_MS = 10_000;
const READINESS_TIMEOUT_MS = 60_000;
const READINESS_INTERVAL_MS = 2_000;

async function runDocker(args) {
  try {
    const result = await execFileAsync("docker", args, {
      env: process.env,
      maxBuffer: 20 * 1024 * 1024
    });
    return String(result.stdout || "").trim();
  } catch (error) {
    const stdout = String(error.stdout || "").trim();
    const stderr = String(error.stderr || "").trim();
    const details = [
      `docker ${args.join(" ")}`,
      stdout ? `stdout:\n${stdout}` : "",
      stderr ? `stderr:\n${stderr}` : ""
    ]
      .filter(Boolean)
      .join("\n\n");
    throw new Error(`Docker command failed:\n${details}`);
  }
}

async function assertContainerRunning(containerName) {
  const running = await runDocker(["inspect", "-f", "{{.State.Running}}", containerName]);
  if (running !== "true") {
    throw new Error(`Container '${containerName}' is not running`);
  }
}

function formatErrorDetails(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const cause = error.cause;
  if (!cause || typeof cause !== "object") {
    return error.message;
  }

  const causeCode = typeof cause.code === "string" ? cause.code : undefined;
  const causeMessage = typeof cause.message === "string" ? cause.message : undefined;
  if (!causeCode && !causeMessage) {
    return error.message;
  }

  return [error.message, causeCode, causeMessage].filter(Boolean).join(" | ");
}

async function assertHttpOk(url, label) {
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    throw new Error(`${label} check failed for ${url}: ${formatErrorDetails(error)}`);
  }

  if (!response.ok) {
    throw new Error(`${label} check failed for ${url} (HTTP ${response.status})`);
  }
}

export async function assertHttpOkEventually(
  url,
  label,
  { timeoutMs = READINESS_TIMEOUT_MS, intervalMs = READINESS_INTERVAL_MS } = {}
) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  let lastError;

  while (Date.now() < deadline) {
    attempt += 1;
    try {
      await assertHttpOk(url, label);
      if (attempt > 1) {
        console.info(`${label} became ready after ${attempt} attempts: ${url}`);
      }
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  const detail = formatErrorDetails(lastError);
  throw new Error(
    `${label} did not become ready within ${timeoutMs}ms at ${url}. Last error: ${detail}`
  );
}

export function normalizeBaseUrl(url) {
  if (typeof url !== "string") {
    throw new Error("Base URL must be a string");
  }

  return url.replace(/\/$/u, "");
}

export async function verifyCandidateGithub({
  manifestPath,
  deployStatePath,
  apiBaseUrl,
  webBaseUrl
}) {
  const errors = await validateReleaseCandidateFile(manifestPath);
  if (errors.length > 0) {
    const details = errors.map((entry) => `- ${entry.path}: ${entry.message}`).join("\n");
    throw new Error(`Manifest validation failed for GitHub acceptance verify:\n${details}`);
  }

  const manifest = await readJsonFile(manifestPath);
  const deployState = await readJsonFile(deployStatePath);

  if (deployState.candidateId !== manifest.candidateId) {
    throw new Error(
      `Deploy state candidateId mismatch. expected=${manifest.candidateId} actual=${deployState.candidateId}`
    );
  }

  if (deployState.sourceRevision !== manifest.source.revision) {
    throw new Error(
      `Deploy state sourceRevision mismatch. expected=${manifest.source.revision} actual=${deployState.sourceRevision}`
    );
  }

  if (deployState.worker?.placeholder !== true) {
    throw new Error("Worker placeholder marker is missing in GitHub acceptance deploy state");
  }

  if (deployState.worker?.image !== manifest.artifacts.workerImage) {
    throw new Error("Worker digest mismatch between deploy state and release candidate manifest");
  }

  await assertContainerRunning(deployState.containers?.postgres?.name);
  await assertContainerRunning(deployState.containers?.api?.name);
  await assertContainerRunning(deployState.containers?.web?.name);

  await assertHttpOkEventually(`${normalizeBaseUrl(apiBaseUrl)}/health`, "API health");
  await assertHttpOkEventually(`${normalizeBaseUrl(webBaseUrl)}/`, "Web root");
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  await verifyCandidateGithub({
    manifestPath: requireOption(options, "manifest"),
    deployStatePath: requireOption(options, "deploy-state"),
    apiBaseUrl: optionalOption(options, "api-base-url") ?? "http://127.0.0.1:3001",
    webBaseUrl: optionalOption(options, "web-base-url") ?? "http://127.0.0.1:3000"
  });

  console.info("GitHub acceptance verification passed.");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
