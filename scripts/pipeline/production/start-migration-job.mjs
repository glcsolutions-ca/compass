import {
  appendGithubOutput,
  getHeadSha,
  getTier,
  requireEnv,
  runJson,
  writeDeployArtifact
} from "./utils.mjs";

const resourceGroup = requireEnv("AZURE_RESOURCE_GROUP");
const jobName = requireEnv("ACA_MIGRATE_JOB_NAME");

async function main() {
  const response = await runJson("az", [
    "containerapp",
    "job",
    "start",
    "--resource-group",
    resourceGroup,
    "--name",
    jobName,
    "--output",
    "json"
  ]);

  const executionName = response?.name || response?.id?.split("/").pop();
  if (!executionName) {
    throw new Error("Failed to determine migration job execution name");
  }

  const artifactPath = await writeDeployArtifact("migration-start", {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha: getHeadSha(),
    tier: getTier(),
    status: "pass",
    jobName,
    executionName
  });

  await appendGithubOutput({
    migration_start_path: artifactPath,
    migration_execution_name: executionName
  });

  console.info(`Started migration execution ${executionName}`);
}

void main();
