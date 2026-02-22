import {
  appendGithubOutput,
  getHeadSha,
  getTier,
  requireEnv,
  run,
  runJson,
  toHttpsUrl,
  writeDeployArtifact
} from "./utils.mjs";

const resourceGroup = requireEnv("AZURE_RESOURCE_GROUP");
const apiAppName = requireEnv("ACA_API_APP_NAME");
const webAppName = requireEnv("ACA_WEB_APP_NAME");
const apiCandidateRevision = requireEnv("API_CANDIDATE_REVISION");
const webCandidateRevision = requireEnv("WEB_CANDIDATE_REVISION");

async function setTraffic(appName, revisionName) {
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
    `${revisionName}=100`,
    "--output",
    "none"
  ]);
}

async function addProdLabel(appName, revisionName) {
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
    revisionName,
    "--output",
    "none"
  ]);
}

async function getAppUrl(appName) {
  const app = await runJson("az", [
    "containerapp",
    "show",
    "--resource-group",
    resourceGroup,
    "--name",
    appName,
    "--output",
    "json"
  ]);

  return toHttpsUrl(
    app?.properties?.configuration?.ingress?.fqdn || app?.properties?.latestRevisionFqdn
  );
}

async function main() {
  await setTraffic(apiAppName, apiCandidateRevision);
  await addProdLabel(apiAppName, apiCandidateRevision);

  await setTraffic(webAppName, webCandidateRevision);
  await addProdLabel(webAppName, webCandidateRevision);

  const apiProdUrl = await getAppUrl(apiAppName);
  const webProdUrl = await getAppUrl(webAppName);

  const artifactPath = await writeDeployArtifact("promotion", {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha: getHeadSha(),
    tier: getTier(),
    status: "pass",
    api: {
      appName: apiAppName,
      candidateRevision: apiCandidateRevision,
      prodUrl: apiProdUrl
    },
    web: {
      appName: webAppName,
      candidateRevision: webCandidateRevision,
      prodUrl: webProdUrl
    }
  });

  await appendGithubOutput({
    promotion_path: artifactPath,
    api_prod_url: apiProdUrl || "",
    web_prod_url: webProdUrl || ""
  });

  console.info("Traffic promotion complete");
}

void main();
