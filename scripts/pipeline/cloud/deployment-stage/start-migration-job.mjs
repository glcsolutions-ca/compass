import {
  appendGithubOutput,
  getHeadSha,
  requireEnv,
  runJson,
  writeDeployArtifact
} from "./utils.mjs";
import { withCcsGuardrail } from "../../shared/ccs-contract.mjs";

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
    status: "pass",
    jobName,
    executionName
  });

  await appendGithubOutput({
    migration_start_path: artifactPath,
    migration_execution_name: executionName
  });

  console.info(`Started migration execution ${executionName}`);
  return { status: "pass", code: "MIGRATION_START_PASS" };
}

void withCcsGuardrail({
  guardrailId: "deployment.migration-start",
  command: "node scripts/pipeline/cloud/deployment-stage/start-migration-job.mjs",
  passCode: "MIGRATION_START_PASS",
  passRef: "docs/runbooks/migration-safety.md",
  run: main,
  mapError: (error) => ({
    code: "MIGRATION_START_FAIL",
    why: error instanceof Error ? error.message : String(error),
    fix: "Resolve migration job start prerequisites and retry.",
    doCommands: ["node scripts/pipeline/cloud/deployment-stage/start-migration-job.mjs"],
    ref: "docs/runbooks/migration-safety.md"
  })
});
