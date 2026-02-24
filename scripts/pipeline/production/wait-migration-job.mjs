import {
  appendGithubOutput,
  getHeadSha,
  getTier,
  requireEnv,
  run,
  runJson,
  sleep,
  writeDeployArtifact
} from "./utils.mjs";

const resourceGroup = requireEnv("AZURE_RESOURCE_GROUP");
const jobName = requireEnv("ACA_MIGRATE_JOB_NAME");
const executionName = requireEnv("MIGRATION_EXECUTION_NAME");
const timeoutSeconds = Number(process.env.MIGRATION_TIMEOUT_SECONDS ?? 900);
const migrationContainerName = process.env.MIGRATION_CONTAINER_NAME?.trim() || "migrate";
const pollIntervalMs = 5000;

function normalizeStatus(value) {
  return String(value || "unknown").toLowerCase();
}

async function readExecution() {
  try {
    return await runJson("az", [
      "containerapp",
      "job",
      "execution",
      "show",
      "--resource-group",
      resourceGroup,
      "--name",
      jobName,
      "--job-execution-name",
      executionName,
      "--output",
      "json"
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();

    if (normalized.includes("not found") || normalized.includes("could not be found")) {
      return null;
    }

    throw error;
  }
}

async function readFailureLogs() {
  try {
    const { stdout } = await run("az", [
      "containerapp",
      "job",
      "logs",
      "show",
      "--resource-group",
      resourceGroup,
      "--name",
      jobName,
      "--execution",
      executionName,
      "--container",
      migrationContainerName,
      "--format",
      "text",
      "--tail",
      "300"
    ]);

    return {
      logs: stdout,
      source: "job-cli"
    };
  } catch (error) {
    return {
      logs: error instanceof Error ? error.message : String(error),
      source: "job-cli-error"
    };
  }
}

function summarizeExecution(execution) {
  return {
    status: normalizeStatus(execution?.properties?.status || execution?.status),
    startTime:
      execution?.properties?.startTime ||
      execution?.properties?.startedTime ||
      execution?.startTime ||
      null,
    endTime:
      execution?.properties?.endTime ||
      execution?.properties?.finishedTime ||
      execution?.endTime ||
      null
  };
}

async function writeAndPublish(payload) {
  const artifactPath = await writeDeployArtifact("migration", payload);
  await appendGithubOutput({
    migration_path: artifactPath,
    migration_status: payload.executionStatus || payload.status
  });
  return artifactPath;
}

async function failMigration({
  reasonCode,
  reason,
  startedAt,
  statusTimeline,
  executionStatus,
  executionSummary,
  logs,
  logsSource
}) {
  await writeAndPublish({
    schemaVersion: "2",
    generatedAt: new Date().toISOString(),
    headSha: getHeadSha(),
    tier: getTier(),
    status: "fail",
    reasonCode,
    reason,
    jobName,
    executionName,
    executionStatus,
    executionSummary,
    timeoutSeconds,
    pollIntervalMs,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    statusTimeline,
    logs: logs ?? "",
    logsSource: logsSource ?? "none"
  });

  throw new Error(
    `Migration execution ${executionName} failed: ${reasonCode} (${executionStatus})`
  );
}

async function main() {
  const startedAt = Date.now();
  const statusTimeline = [];
  let lastObservedStatus = "";
  let latestExecutionSummary = null;

  while (Date.now() - startedAt < timeoutSeconds * 1000) {
    let execution = null;
    try {
      execution = await readExecution();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await failMigration({
        reasonCode: "MIGRATION_EXECUTION_QUERY_ERROR",
        reason: message,
        startedAt,
        statusTimeline,
        executionStatus: "query-error",
        executionSummary: latestExecutionSummary,
        logs: message,
        logsSource: "query-error"
      });
      return;
    }

    if (!execution) {
      if (lastObservedStatus !== "not-found") {
        statusTimeline.push({
          at: new Date().toISOString(),
          status: "not-found",
          detail: "execution not yet visible"
        });
        lastObservedStatus = "not-found";
      }
      await sleep(pollIntervalMs);
      continue;
    }

    const status = normalizeStatus(execution?.properties?.status || execution?.status);
    latestExecutionSummary = summarizeExecution(execution);
    if (status !== lastObservedStatus) {
      statusTimeline.push({
        at: new Date().toISOString(),
        status,
        detail: "execution status changed"
      });
      lastObservedStatus = status;
    }

    if (["succeeded", "completed", "success"].includes(status)) {
      await writeAndPublish({
        schemaVersion: "2",
        generatedAt: new Date().toISOString(),
        headSha: getHeadSha(),
        tier: getTier(),
        status: "pass",
        reasonCode: "",
        reason: "",
        jobName,
        executionName,
        executionStatus: status,
        executionSummary: latestExecutionSummary,
        timeoutSeconds,
        pollIntervalMs,
        elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
        statusTimeline,
        logs: "",
        logsSource: "none"
      });

      console.info(`Migration execution ${executionName} succeeded (${status})`);
      return;
    }

    if (["failed", "failure", "cancelled", "canceled", "error"].includes(status)) {
      const logResult = await readFailureLogs();
      await failMigration({
        reasonCode: "MIGRATION_EXECUTION_FAILED",
        reason: `execution reached terminal failure state (${status})`,
        startedAt,
        statusTimeline,
        executionStatus: status,
        executionSummary: latestExecutionSummary,
        logs: logResult.logs,
        logsSource: logResult.source
      });
      return;
    }

    await sleep(pollIntervalMs);
  }

  const timeoutLogs = await readFailureLogs();
  await failMigration({
    reasonCode: "MIGRATION_EXECUTION_TIMEOUT",
    reason: `timed out after ${timeoutSeconds} seconds`,
    startedAt,
    statusTimeline,
    executionStatus: "timeout",
    executionSummary: latestExecutionSummary,
    logs: timeoutLogs.logs,
    logsSource: timeoutLogs.source
  });
}

void main();
