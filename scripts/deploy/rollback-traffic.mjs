import {
  appendGithubOutput,
  getHeadSha,
  getTier,
  requireEnv,
  run,
  writeDeployArtifact
} from "./utils.mjs";

const resourceGroup = requireEnv("AZURE_RESOURCE_GROUP");
const apiAppName = requireEnv("ACA_API_APP_NAME");
const webAppName = requireEnv("ACA_WEB_APP_NAME");
const previousApiRevision = process.env.PREVIOUS_API_REVISION?.trim();
const previousWebRevision = process.env.PREVIOUS_WEB_REVISION?.trim();

async function rollbackApp(appName, previousRevision) {
  if (!previousRevision) {
    return {
      appName,
      status: "skipped",
      reason: "previous revision was not provided"
    };
  }

  await run("az", [
    "containerapp",
    "ingress",
    "traffic",
    "set",
    "--resource-group",
    resourceGroup,
    "--name",
    appName,
    "--revision-weight",
    `${previousRevision}=100`,
    "--output",
    "none"
  ]);

  await run("az", [
    "containerapp",
    "revision",
    "label",
    "add",
    "--resource-group",
    resourceGroup,
    "--name",
    appName,
    "--label",
    "prod",
    "--revision",
    previousRevision,
    "--output",
    "none"
  ]);

  return {
    appName,
    status: "rolled-back",
    revision: previousRevision
  };
}

async function main() {
  const api = await rollbackApp(apiAppName, previousApiRevision);
  const web = await rollbackApp(webAppName, previousWebRevision);

  const artifactPath = await writeDeployArtifact("rollback", {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha: getHeadSha(),
    tier: getTier(),
    status: "pass",
    api,
    web
  });

  await appendGithubOutput({ rollback_path: artifactPath });
  console.info("Rollback step finished");
}

void main();
