import {
  appendGithubOutput,
  getHeadSha,
  getTier,
  pickRevisionWithTraffic,
  requireEnv,
  run,
  runJson,
  sleep,
  toHttpsUrl,
  writeDeployArtifact
} from "./utils.mjs";

const resourceGroup = requireEnv("AZURE_RESOURCE_GROUP");
const apiAppName = requireEnv("ACA_API_APP_NAME");
const webAppName = requireEnv("ACA_WEB_APP_NAME");
const apiImage = requireEnv("API_IMAGE");
const webImage = requireEnv("WEB_IMAGE");
const headSha = getHeadSha();
const tier = getTier();
const suffixBase = (process.env.REVISION_SUFFIX_PREFIX?.trim() || headSha.slice(0, 12))
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, "-")
  .slice(0, 30);

function buildSuffix(kind) {
  const stamp = Date.now().toString(36).slice(-6);
  return `${suffixBase}-${kind}-${stamp}`.slice(0, 63);
}

async function listRevisions(appName) {
  const revisions = await runJson("az", [
    "containerapp",
    "revision",
    "list",
    "--resource-group",
    resourceGroup,
    "--name",
    appName,
    "--output",
    "json"
  ]);

  return Array.isArray(revisions) ? revisions : [];
}

async function waitForRevision(appName, revisionSuffix) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const revisions = await listRevisions(appName);
    const matches = revisions
      .filter((revision) => String(revision?.name ?? "").includes(revisionSuffix))
      .sort((a, b) => {
        const aTime = String(a?.properties?.createdTime ?? "");
        const bTime = String(b?.properties?.createdTime ?? "");
        return bTime.localeCompare(aTime);
      });

    const newest = matches[0];
    if (newest?.name) {
      return String(newest.name);
    }

    await sleep(5000);
  }

  throw new Error(
    `Timed out waiting for revision containing suffix '${revisionSuffix}' for ${appName}`
  );
}

async function getRevisionFqdn(appName, revisionName) {
  const revision = await runJson("az", [
    "containerapp",
    "revision",
    "show",
    "--resource-group",
    resourceGroup,
    "--name",
    appName,
    "--revision",
    revisionName,
    "--output",
    "json"
  ]);

  return (
    revision?.properties?.fqdn || revision?.properties?.ingress?.fqdn || revision?.fqdn || null
  );
}

async function getAppFqdn(appName) {
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

  return (
    app?.properties?.configuration?.ingress?.fqdn || app?.properties?.latestRevisionFqdn || null
  );
}

async function addRevisionLabel(appName, label, revisionName) {
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
    label,
    "--revision",
    revisionName,
    "--output",
    "none"
  ]);
}

async function updateAppImage(appName, image, revisionSuffix, extraEnvVars = []) {
  const args = [
    "containerapp",
    "update",
    "--resource-group",
    resourceGroup,
    "--name",
    appName,
    "--image",
    image,
    "--revision-suffix",
    revisionSuffix,
    "--output",
    "json"
  ];

  if (extraEnvVars.length > 0) {
    args.push("--set-env-vars", ...extraEnvVars);
  }

  await run("az", args);
}

async function main() {
  const apiRevisionsBefore = await listRevisions(apiAppName);
  const webRevisionsBefore = await listRevisions(webAppName);
  const previousApiRevision = pickRevisionWithTraffic(apiRevisionsBefore);
  const previousWebRevision = pickRevisionWithTraffic(webRevisionsBefore);

  const apiRevisionSuffix = buildSuffix("api");
  await updateAppImage(apiAppName, apiImage, apiRevisionSuffix);
  const apiCandidateRevision = await waitForRevision(apiAppName, apiRevisionSuffix);
  await addRevisionLabel(apiAppName, "candidate", apiCandidateRevision);

  const apiCandidateFqdn = await getRevisionFqdn(apiAppName, apiCandidateRevision);
  const apiCandidateUrl = toHttpsUrl(apiCandidateFqdn);
  if (!apiCandidateUrl) {
    throw new Error("Unable to resolve API candidate URL after deployment");
  }

  const webRevisionSuffix = buildSuffix("web");
  const webToken = process.env.WEB_BEARER_TOKEN?.trim();
  const webEnvVars = [`API_BASE_URL=${apiCandidateUrl}`];
  if (webToken) {
    webEnvVars.push(`BEARER_TOKEN=${webToken}`);
  }

  await updateAppImage(webAppName, webImage, webRevisionSuffix, webEnvVars);
  const webCandidateRevision = await waitForRevision(webAppName, webRevisionSuffix);
  await addRevisionLabel(webAppName, "candidate", webCandidateRevision);

  const webCandidateFqdn = await getRevisionFqdn(webAppName, webCandidateRevision);
  const webCandidateUrl = toHttpsUrl(webCandidateFqdn);

  const apiAppUrl = toHttpsUrl(await getAppFqdn(apiAppName));
  const webAppUrl = toHttpsUrl(await getAppFqdn(webAppName));

  const artifactPath = await writeDeployArtifact("candidate-deploy", {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    tier,
    status: "pass",
    api: {
      appName: apiAppName,
      previousRevision: previousApiRevision,
      candidateRevision: apiCandidateRevision,
      candidateUrl: apiCandidateUrl,
      appUrl: apiAppUrl
    },
    web: {
      appName: webAppName,
      previousRevision: previousWebRevision,
      candidateRevision: webCandidateRevision,
      candidateUrl: webCandidateUrl,
      appUrl: webAppUrl
    }
  });

  await appendGithubOutput({
    candidate_deploy_path: artifactPath,
    previous_api_revision: previousApiRevision || "",
    previous_web_revision: previousWebRevision || "",
    api_candidate_revision: apiCandidateRevision,
    web_candidate_revision: webCandidateRevision,
    api_candidate_url: apiCandidateUrl,
    web_candidate_url: webCandidateUrl || "",
    api_app_url: apiAppUrl || "",
    web_app_url: webAppUrl || ""
  });

  console.info(`Candidate revisions deployed: ${apiCandidateRevision}, ${webCandidateRevision}`);
}

void main();
