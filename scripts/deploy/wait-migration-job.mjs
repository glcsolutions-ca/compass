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
const logAnalyticsWorkspaceName = process.env.AZURE_LOG_ANALYTICS_WORKSPACE_NAME?.trim() || "";

function normalizeStatus(value) {
  return String(value || "unknown").toLowerCase();
}

async function listExecutions() {
  const executions = await runJson("az", [
    "containerapp",
    "job",
    "execution",
    "list",
    "--resource-group",
    resourceGroup,
    "--name",
    jobName,
    "--output",
    "json"
  ]);

  return Array.isArray(executions) ? executions : [];
}

async function tryReadLogsFromJobCommand() {
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
  } catch {
    return {
      logs: "",
      source: ""
    };
  }
}

async function resolveWorkspaceCustomerId() {
  if (!logAnalyticsWorkspaceName) {
    return "";
  }

  try {
    const { stdout } = await run("az", [
      "monitor",
      "log-analytics",
      "workspace",
      "show",
      "--resource-group",
      resourceGroup,
      "--workspace-name",
      logAnalyticsWorkspaceName,
      "--query",
      "customerId",
      "--output",
      "tsv"
    ]);

    return stdout.trim();
  } catch {
    return "";
  }
}

function formatConsoleRows(rows) {
  return rows
    .map((row) => {
      const timestamp = row?.TimeGenerated || "unknown-time";
      const stream = row?.Stream_s || "log";
      const group = row?.ContainerGroupName_s || executionName;
      const message = row?.Log_s || "";
      return `[${timestamp}] [${stream}] [${group}] ${message}`;
    })
    .join("\n");
}

function formatSystemRows(rows) {
  return rows
    .map((row) => {
      const timestamp = row?.TimeGenerated || "unknown-time";
      const level = row?.Level || "info";
      const reason = row?.Reason_s || "event";
      const replica = row?.ReplicaName_s ? ` [${row.ReplicaName_s}]` : "";
      const message = row?.Log_s || "";
      return `[${timestamp}] [${level}] [${reason}]${replica} ${message}`.trim();
    })
    .join("\n");
}

async function tryReadLogsFromLogAnalytics() {
  const workspaceCustomerId = await resolveWorkspaceCustomerId();
  if (!workspaceCustomerId) {
    return {
      logs: "",
      source: ""
    };
  }

  const consoleQuery = `ContainerAppConsoleLogs_CL
| where ContainerJobName_s == '${jobName}'
| where ContainerGroupName_s startswith '${executionName}'
| project TimeGenerated, Stream_s, ContainerGroupName_s, Log_s
| order by TimeGenerated asc
| take 400`;

  const systemQuery = `ContainerAppSystemLogs_CL
| where JobName_s == '${jobName}' and ExecutionName_s == '${executionName}'
| project TimeGenerated, Level, Reason_s, ReplicaName_s, Log_s
| order by TimeGenerated asc
| take 200`;

  let consoleRows = [];
  let systemRows = [];

  try {
    const result = await runJson("az", [
      "monitor",
      "log-analytics",
      "query",
      "--workspace",
      workspaceCustomerId,
      "--timespan",
      "PT6H",
      "--analytics-query",
      consoleQuery,
      "--output",
      "json"
    ]);
    if (Array.isArray(result)) {
      consoleRows = result;
    }
  } catch {
    consoleRows = [];
  }

  try {
    const result = await runJson("az", [
      "monitor",
      "log-analytics",
      "query",
      "--workspace",
      workspaceCustomerId,
      "--timespan",
      "PT6H",
      "--analytics-query",
      systemQuery,
      "--output",
      "json"
    ]);
    if (Array.isArray(result)) {
      systemRows = result;
    }
  } catch {
    systemRows = [];
  }

  if (consoleRows.length === 0 && systemRows.length === 0) {
    return {
      logs: "",
      source: ""
    };
  }

  const sections = [];
  if (consoleRows.length > 0) {
    sections.push(`Console logs:\n${formatConsoleRows(consoleRows)}`);
  }
  if (systemRows.length > 0) {
    sections.push(`System logs:\n${formatSystemRows(systemRows)}`);
  }

  return {
    logs: sections.join("\n\n"),
    source: "log-analytics"
  };
}

async function tryReadLogs() {
  const fromJob = await tryReadLogsFromJobCommand();
  if (fromJob.logs) {
    return fromJob;
  }

  return tryReadLogsFromLogAnalytics();
}

async function main() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutSeconds * 1000) {
    const executions = await listExecutions();
    const execution = executions.find((item) => String(item?.name) === executionName);

    if (!execution) {
      await sleep(5000);
      continue;
    }

    const status = normalizeStatus(execution?.properties?.status || execution?.status);

    if (["succeeded", "completed", "success"].includes(status)) {
      const artifactPath = await writeDeployArtifact("migration", {
        schemaVersion: "1",
        generatedAt: new Date().toISOString(),
        headSha: getHeadSha(),
        tier: getTier(),
        status: "pass",
        jobName,
        executionName,
        executionStatus: status
      });

      await appendGithubOutput({
        migration_path: artifactPath,
        migration_status: status
      });

      console.info(`Migration execution ${executionName} succeeded (${status})`);
      return;
    }

    if (["failed", "failure", "cancelled", "canceled", "error"].includes(status)) {
      const logResult = await tryReadLogs();
      const artifactPath = await writeDeployArtifact("migration", {
        schemaVersion: "1",
        generatedAt: new Date().toISOString(),
        headSha: getHeadSha(),
        tier: getTier(),
        status: "fail",
        jobName,
        executionName,
        executionStatus: status,
        logs: logResult.logs,
        logsSource: logResult.source || "unavailable"
      });

      await appendGithubOutput({
        migration_path: artifactPath,
        migration_status: status
      });

      throw new Error(`Migration execution ${executionName} failed (${status})`);
    }

    await sleep(5000);
  }

  const artifactPath = await writeDeployArtifact("migration", {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha: getHeadSha(),
    tier: getTier(),
    status: "fail",
    jobName,
    executionName,
    executionStatus: "timeout"
  });

  await appendGithubOutput({
    migration_path: artifactPath,
    migration_status: "timeout"
  });

  throw new Error(`Timed out waiting for migration execution ${executionName}`);
}

void main();
