import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../cli-utils.mjs";
import { runAz } from "./az-command.mjs";

const POLL_INTERVAL_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const CONTAINER_APP_JOB_API_VERSION = "2024-03-01";
export const MIGRATIONS_CONTAINER_NAME = "migrate";
export const MIGRATIONS_JOB_COMMAND = [
  "sh",
  "-c",
  "node packages/database/scripts/migrate.mjs up && node packages/database/scripts/seed-postgres.mjs"
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeExecutionStatus(document) {
  return String(document?.properties?.status ?? document?.status ?? "")
    .trim()
    .toLowerCase();
}

function deriveExecutionName(startResult) {
  if (typeof startResult?.name === "string" && startResult.name.trim().length > 0) {
    return startResult.name.trim();
  }

  if (typeof startResult?.id === "string" && startResult.id.includes("/")) {
    return startResult.id.split("/").filter(Boolean).at(-1);
  }

  return undefined;
}

function serializeCompactJson(value) {
  return JSON.stringify(value, null, 2);
}

function normalizeJobContainer(container) {
  const normalized = {};
  for (const key of ["name", "image", "env", "resources", "command", "args", "volumeMounts"]) {
    if (typeof container?.[key] !== "undefined" && container[key] !== null) {
      normalized[key] = container[key];
    }
  }
  return normalized;
}

export function buildMigrationsJobPatchDocument({ job, migrationsImage }) {
  const template = job?.properties?.template ?? {};
  const containers = Array.isArray(template.containers) ? template.containers : [];
  if (containers.length === 0) {
    throw new Error("Migration job template does not contain any containers to update");
  }

  const patchedContainers = containers.map((container, index) => {
    const name =
      typeof container?.name === "string" && container.name.trim().length > 0
        ? container.name.trim()
        : index === 0
          ? MIGRATIONS_CONTAINER_NAME
          : "";

    const normalized = normalizeJobContainer(container);
    if (name === MIGRATIONS_CONTAINER_NAME || (index === 0 && !name)) {
      return {
        ...normalized,
        name: name || MIGRATIONS_CONTAINER_NAME,
        image: migrationsImage,
        command: MIGRATIONS_JOB_COMMAND
      };
    }

    return normalized;
  });

  return {
    properties: {
      template: {
        containers: patchedContainers,
        initContainers: Array.isArray(template.initContainers) ? template.initContainers : [],
        volumes: Array.isArray(template.volumes) ? template.volumes : []
      }
    }
  };
}

export function buildMigrationsJobUpdateArgs({ jobId, patchDocument }) {
  return [
    "rest",
    "--method",
    "PATCH",
    "--uri",
    `https://management.azure.com${jobId}?api-version=${CONTAINER_APP_JOB_API_VERSION}`,
    "--body",
    serializeCompactJson(patchDocument)
  ];
}

export function buildMigrationsFailureMessage({ executionName, status, execution }) {
  const container = execution?.properties?.template?.containers?.[0] ?? {};
  const templateSummary = {
    image: container.image ?? "",
    command: Array.isArray(container.command) ? container.command : [],
    startTime: execution?.properties?.startTime ?? ""
  };
  return [
    `Migration job execution ${executionName} failed with status '${status || "unknown"}'`,
    `Execution template:\n${serializeCompactJson(templateSummary)}`
  ].join("\n\n");
}

export async function runMigrationsAzure({
  resourceGroup,
  jobName,
  migrationsImage,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  const job = await runAz([
    "containerapp",
    "job",
    "show",
    "--resource-group",
    resourceGroup,
    "--name",
    jobName
  ]);
  const jobId = String(job?.id ?? "").trim();
  if (!jobId) {
    throw new Error(`Could not resolve Azure resource id for migration job ${jobName}`);
  }

  await runAz(
    buildMigrationsJobUpdateArgs({
      jobId,
      patchDocument: buildMigrationsJobPatchDocument({ job, migrationsImage })
    })
  );

  const startResult = await runAz([
    "containerapp",
    "job",
    "start",
    "--resource-group",
    resourceGroup,
    "--name",
    jobName
  ]);

  const executionName = deriveExecutionName(startResult);
  if (!executionName) {
    throw new Error(
      "Could not determine migration job execution name from az containerapp job start"
    );
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let execution;
    try {
      execution = await runAz([
        "containerapp",
        "job",
        "execution",
        "show",
        "--resource-group",
        resourceGroup,
        "--name",
        jobName,
        "--job-execution-name",
        executionName
      ]);
    } catch {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    const status = normalizeExecutionStatus(execution);
    if (status === "succeeded") {
      return {
        executionName,
        status: "succeeded"
      };
    }

    if (["failed", "canceled", "cancelled", "error"].includes(status)) {
      throw new Error(
        buildMigrationsFailureMessage({
          executionName,
          status,
          execution
        })
      );
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for migration job execution ${executionName} to complete`);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const timeoutMsOption = options["timeout-ms"];

  const timeoutMs =
    typeof timeoutMsOption === "string" && timeoutMsOption.trim().length > 0
      ? Number(timeoutMsOption)
      : DEFAULT_TIMEOUT_MS;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number when provided");
  }

  const result = await runMigrationsAzure({
    resourceGroup: requireOption(options, "resource-group"),
    jobName: requireOption(options, "job-name"),
    migrationsImage: requireOption(options, "migrations-image"),
    timeoutMs
  });

  console.info(`Migrations completed: execution=${result.executionName}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
