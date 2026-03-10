import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import { readJsonFile } from "../../../shared/scripts/pipeline-contract-lib.mjs";
import { MIGRATIONS_JOB_COMMAND } from "../../../shared/scripts/azure/run-migrations-azure.mjs";

function run(command, args, { env = process.env, cwd, stdio = "pipe" } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      cwd,
      stdio
    });

    let stdout = "";
    let stderr = "";

    if (child.stdout) {
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
    }

    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed (${code})\n${stderr || stdout}`));
      }
    });
    child.on("error", reject);
  });
}

function runSync(command, args, { env = process.env, cwd } = {}) {
  const result = spawnSync(command, args, {
    env,
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status})\n${result.stderr || result.stdout}`
    );
  }
  return String(result.stdout || "").trim();
}

function readCommandOutput(command, args, { env = process.env, cwd } = {}) {
  const result = spawnSync(command, args, {
    env,
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  return {
    status: result.status ?? null,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || "")
  };
}

async function waitForPostgres(containerName) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const result = spawnSync("docker", ["exec", containerName, "pg_isready", "-U", "postgres"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    if (result.status === 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Timed out waiting for local Postgres");
}

function readContainerState(containerName) {
  const result = readCommandOutput("docker", [
    "inspect",
    containerName,
    "--format",
    "{{json .State}}"
  ]);

  if (result.status !== 0) {
    return null;
  }

  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    return null;
  }
}

async function waitForContainerHttp(
  containerName,
  url,
  { timeoutMs = 60000, expectedStatuses = [200] } = {}
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = readContainerState(containerName);
    if (state && state.Running === false) {
      const status = typeof state.Status === "string" ? state.Status : "exited";
      const exitCode =
        typeof state.ExitCode === "number" && Number.isFinite(state.ExitCode)
          ? state.ExitCode
          : "unknown";
      throw new Error(
        `Container ${containerName} stopped before ${url} was ready (status=${status}, exitCode=${exitCode})`
      );
    }

    try {
      const response = await fetch(url);
      if (expectedStatuses.includes(response.status)) {
        return;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function captureLogs(outputDir, containers) {
  for (const container of containers) {
    try {
      const logs = readCommandOutput("docker", ["logs", container]);
      const combined = `${logs.stdout}${logs.stderr}`.trim();
      await writeFile(path.join(outputDir, `${container}.log`), combined, "utf8");
    } catch {}

    try {
      const inspect = runSync("docker", ["inspect", container]);
      await writeFile(path.join(outputDir, `${container}.inspect.json`), `${inspect}\n`, "utf8");
    } catch {}
  }
}

async function prefetchCandidateImages(manifest) {
  const images = [manifest.artifacts.apiImage, manifest.artifacts.webImage];
  await Promise.all(images.map((image) => run("docker", ["pull", image])));
}

export async function runAcceptanceFromCandidate({ manifestPath, outputDir }) {
  return runCandidateRuntimeChecks({
    manifestPath,
    outputDir,
    includeBrowserSmoke: true,
    includeSystemSmoke: true
  });
}

export async function runCandidateRuntimeChecks({
  manifestPath,
  outputDir,
  includeBrowserSmoke = true,
  includeSystemSmoke = true
}) {
  const manifest = await readJsonFile(manifestPath);
  const network = `compass-acceptance-${Date.now()}`;
  const postgresContainer = `${network}-postgres`;
  const apiContainer = `${network}-api`;
  const webContainer = `${network}-web`;
  const databaseUrl = `postgresql://postgres:postgres@${postgresContainer}:5432/compass?sslmode=disable`;
  const diagnosticsDir = path.resolve(outputDir);

  await mkdir(diagnosticsDir, { recursive: true });
  await prefetchCandidateImages(manifest);
  await run("docker", ["network", "create", network]);

  try {
    await run("docker", [
      "run",
      "-d",
      "--name",
      postgresContainer,
      "--network",
      network,
      "-e",
      "POSTGRES_DB=compass",
      "-e",
      "POSTGRES_USER=postgres",
      "-e",
      "POSTGRES_PASSWORD=postgres",
      "postgres:16-alpine"
    ]);
    await waitForPostgres(postgresContainer);

    await run("docker", [
      "run",
      "--rm",
      "--network",
      network,
      "-e",
      `DATABASE_URL=${databaseUrl}`,
      "-e",
      "DB_SSL_MODE=disable",
      "-e",
      "DB_SSL_REJECT_UNAUTHORIZED=false",
      "-e",
      "SEED_DEFAULT_TENANT_ID=acceptance-tenant",
      "-e",
      "SEED_DEFAULT_APP_CLIENT_ID=integration-client",
      "-e",
      "SEED_DEFAULT_USER_OID=smoke-user",
      "-e",
      "SEED_DEFAULT_USER_EMAIL=smoke-user@compass.local",
      "-e",
      "SEED_DEFAULT_USER_DISPLAY_NAME=Smoke User",
      manifest.artifacts.apiImage,
      ...MIGRATIONS_JOB_COMMAND
    ]);

    await run("docker", [
      "run",
      "-d",
      "--name",
      apiContainer,
      "--network",
      network,
      "-p",
      "127.0.0.1:3001:3001",
      "-e",
      "API_HOST=0.0.0.0",
      "-e",
      "API_PORT=3001",
      "-e",
      `DATABASE_URL=${databaseUrl}`,
      "-e",
      "DB_SSL_MODE=disable",
      "-e",
      "DB_SSL_REJECT_UNAUTHORIZED=false",
      "-e",
      "AUTH_MODE=mock",
      "-e",
      "WEB_BASE_URL=http://127.0.0.1:3000",
      "-e",
      "LOG_LEVEL=warn",
      "-e",
      "AGENT_GATEWAY_ENABLED=true",
      "-e",
      "AGENT_CLOUD_MODE_ENABLED=true",
      "-e",
      "AGENT_RUNTIME_PROVIDER=mock",
      manifest.artifacts.apiImage
    ]);

    await run("docker", [
      "run",
      "-d",
      "--name",
      webContainer,
      "--network",
      network,
      "-p",
      "127.0.0.1:3000:3000",
      "-e",
      `API_BASE_URL=http://${apiContainer}:3001`,
      manifest.artifacts.webImage
    ]);

    await waitForContainerHttp(apiContainer, "http://127.0.0.1:3001/health");
    await waitForContainerHttp(webContainer, "http://127.0.0.1:3000/login");

    const systemEnv = {
      ...process.env,
      HEAD_SHA: manifest.source.revision,
      TESTED_SHA: manifest.source.revision,
      BASE_URL: "http://127.0.0.1:3001",
      TARGET_API_BASE_URL: "http://127.0.0.1:3001"
    };
    const e2eEnv = {
      ...process.env,
      WEB_BASE_URL: "http://127.0.0.1:3000"
    };

    if (includeSystemSmoke) {
      await run("pnpm", ["test:acceptance:api"], {
        env: systemEnv,
        cwd: path.resolve("."),
        stdio: "inherit"
      });
    }
    if (includeBrowserSmoke) {
      await run("pnpm", ["test:acceptance:web"], {
        env: e2eEnv,
        cwd: path.resolve("."),
        stdio: "inherit"
      });
    }

    const result = {
      schemaVersion: "acceptance-runtime.v1",
      candidateId: manifest.candidateId,
      sourceRevision: manifest.source.revision,
      apiBaseUrl: "http://127.0.0.1:3001",
      webBaseUrl: "http://127.0.0.1:3000",
      verdict: "pass",
      completedAt: new Date().toISOString()
    };
    await writeFile(
      path.join(diagnosticsDir, "acceptance-result.json"),
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8"
    );
    return result;
  } catch (error) {
    await captureLogs(diagnosticsDir, [postgresContainer, apiContainer, webContainer]);
    const result = {
      schemaVersion: "acceptance-runtime.v1",
      candidateId: manifest.candidateId,
      sourceRevision: manifest.source.revision,
      verdict: "fail",
      completedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    };
    await writeFile(
      path.join(diagnosticsDir, "acceptance-result.json"),
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8"
    );
    throw error;
  } finally {
    for (const container of [webContainer, apiContainer, postgresContainer]) {
      await run("docker", ["rm", "-f", container]).catch(() => {});
    }
    await run("docker", ["network", "rm", network]).catch(() => {});
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const diagnosticsDir = requireOption(options, "diagnostics-dir");
  await runCandidateRuntimeChecks({
    manifestPath: requireOption(options, "manifest"),
    outputDir: diagnosticsDir,
    includeBrowserSmoke: true,
    includeSystemSmoke: true
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
