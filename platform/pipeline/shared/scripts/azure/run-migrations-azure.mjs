import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../cli-utils.mjs";
import { runAz } from "./az-command.mjs";

const POLL_INTERVAL_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

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

export async function runMigrationsAzure({
  resourceGroup,
  jobName,
  migrationsImage,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  await runAz([
    "containerapp",
    "job",
    "update",
    "--resource-group",
    resourceGroup,
    "--name",
    jobName,
    "--image",
    migrationsImage
  ]);

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
        `Migration job execution ${executionName} failed with status '${status || "unknown"}'`
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
