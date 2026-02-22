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

async function tryReadLogs() {
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
      executionName
    ]);
    return stdout;
  } catch {
    return "";
  }
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
      const logs = await tryReadLogs();
      const artifactPath = await writeDeployArtifact("migration", {
        schemaVersion: "1",
        generatedAt: new Date().toISOString(),
        headSha: getHeadSha(),
        tier: getTier(),
        status: "fail",
        jobName,
        executionName,
        executionStatus: status,
        logs
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
