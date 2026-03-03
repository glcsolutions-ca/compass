import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { parseCliArgs, optionalOption, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import { readJsonFile, writeJsonFile } from "../../../shared/scripts/pipeline-contract-lib.mjs";
import { validateReleaseCandidateFile } from "../../../shared/scripts/validate-release-candidate.mjs";

const execFileAsync = promisify(execFile);
const POSTGRES_IMAGE = "postgres:16-alpine";
const POSTGRES_USER = "compass";
const POSTGRES_PASSWORD = "compass";
const POSTGRES_DB = "compass";

function normalizeId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/gu, "-");
}

function inferRunId(explicitRunId) {
  const candidate = explicitRunId ?? process.env.GITHUB_RUN_ID ?? `${Date.now()}`;
  const normalized = normalizeId(candidate);
  return normalized.length > 0 ? normalized : `${Date.now()}`;
}

async function runDocker(args, options = {}) {
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

    if (options.allowFailure) {
      return "";
    }

    throw new Error(`Docker command failed:\n${details}`);
  }
}

async function waitForPostgres(containerName, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await runDocker(
      ["exec", containerName, "pg_isready", "-U", POSTGRES_USER, "-d", POSTGRES_DB],
      {
        allowFailure: true
      }
    );
    if (status.toLowerCase().includes("accepting connections")) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(`Postgres container '${containerName}' did not become ready within timeout`);
}

export async function deployCandidateGithub({ manifestPath, outPath, runId: explicitRunId }) {
  const validationErrors = await validateReleaseCandidateFile(manifestPath);
  if (validationErrors.length > 0) {
    const details = validationErrors.map((entry) => `- ${entry.path}: ${entry.message}`).join("\n");
    throw new Error(`Manifest validation failed for GitHub acceptance deploy:\n${details}`);
  }

  const manifest = await readJsonFile(manifestPath);
  const runId = inferRunId(explicitRunId);
  const prefix = `compass-acceptance-${runId}`;
  const networkName = `${prefix}-net`;
  const postgresContainer = `${prefix}-postgres`;
  const apiContainer = `${prefix}-api`;
  const webContainer = `${prefix}-web`;
  const databaseUrl = `postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${postgresContainer}:5432/${POSTGRES_DB}`;

  await runDocker(["pull", manifest.artifacts.apiImage]);
  await runDocker(["pull", manifest.artifacts.webImage]);
  await runDocker(["pull", manifest.artifacts.workerImage]);
  await runDocker(["pull", manifest.artifacts.migrationsArtifact]);

  await runDocker(["network", "create", networkName]);

  await runDocker([
    "run",
    "-d",
    "--name",
    postgresContainer,
    "--network",
    networkName,
    "-e",
    `POSTGRES_USER=${POSTGRES_USER}`,
    "-e",
    `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
    "-e",
    `POSTGRES_DB=${POSTGRES_DB}`,
    POSTGRES_IMAGE
  ]);

  await waitForPostgres(postgresContainer);

  await runDocker([
    "run",
    "--rm",
    "--network",
    networkName,
    "-e",
    `DATABASE_URL=${databaseUrl}`,
    manifest.artifacts.migrationsArtifact
  ]);

  await runDocker([
    "run",
    "-d",
    "--name",
    apiContainer,
    "--network",
    networkName,
    "-p",
    "3001:3001",
    "-e",
    `DATABASE_URL=${databaseUrl}`,
    "-e",
    "AUTH_MODE=mock",
    "-e",
    "AGENT_GATEWAY_ENABLED=false",
    "-e",
    "API_HOST=0.0.0.0",
    "-e",
    "API_PORT=3001",
    "-e",
    "WEB_BASE_URL=http://127.0.0.1:3000",
    manifest.artifacts.apiImage
  ]);

  await runDocker([
    "run",
    "-d",
    "--name",
    webContainer,
    "--network",
    networkName,
    "-p",
    "3000:3000",
    "-e",
    `API_BASE_URL=http://${apiContainer}:3001`,
    manifest.artifacts.webImage
  ]);

  const deployState = {
    schemaVersion: "github-acceptance-deploy-state.v1",
    generatedAt: new Date().toISOString(),
    candidateId: manifest.candidateId,
    sourceRevision: manifest.source.revision,
    runtime: {
      kind: "github-runner-local",
      runId
    },
    network: {
      name: networkName
    },
    containers: {
      postgres: {
        name: postgresContainer,
        image: POSTGRES_IMAGE
      },
      api: {
        name: apiContainer,
        image: manifest.artifacts.apiImage
      },
      web: {
        name: webContainer,
        image: manifest.artifacts.webImage
      }
    },
    endpoints: {
      apiBaseUrl: "http://127.0.0.1:3001",
      webBaseUrl: "http://127.0.0.1:3000"
    },
    worker: {
      placeholder: true,
      image: manifest.artifacts.workerImage,
      note: "Worker runtime not started in bare-minimum acceptance (no Service Bus emulator)."
    }
  };

  await writeJsonFile(outPath, deployState);
  return deployState;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const manifestPath = requireOption(options, "manifest");
  const outPath =
    optionalOption(options, "out") ?? path.resolve(".artifacts", "acceptance", "deploy-state.json");

  const state = await deployCandidateGithub({
    manifestPath,
    outPath,
    runId: optionalOption(options, "run-id")
  });

  console.info(`GitHub acceptance deployment state written: ${path.resolve(outPath)}`);
  console.info(`Deployed candidate ${state.candidateId} on local runner resources.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
