import {
  appendGithubOutput,
  getHeadSha,
  requireEnv,
  run,
  runJson,
  writeDeployArtifact
} from "./utils.mjs";

function normalizeRevisionWeights(trafficEntries, newRevisionName, fallbackRevisionName) {
  const keptWeights = [];

  for (const entry of Array.isArray(trafficEntries) ? trafficEntries : []) {
    const revisionName = String(entry?.revisionName || "").trim();
    const weight = Number(entry?.weight ?? 0);
    if (!revisionName || revisionName === newRevisionName || weight <= 0) {
      continue;
    }
    keptWeights.push({ revisionName, weight });
  }

  if (keptWeights.length === 0 && fallbackRevisionName) {
    keptWeights.push({ revisionName: fallbackRevisionName, weight: 100 });
  }

  return [...keptWeights, { revisionName: newRevisionName, weight: 0 }];
}

function buildRevisionWeightArgs(weights) {
  return weights.map((entry) => `${entry.revisionName}=${entry.weight}`);
}

async function ensureMultipleRevisionMode(resourceGroup, appName) {
  await run("az", [
    "containerapp",
    "revision",
    "set-mode",
    "--resource-group",
    resourceGroup,
    "--name",
    appName,
    "--mode",
    "multiple",
    "--only-show-errors",
    "--output",
    "none"
  ]);
}

async function stageAppZeroTraffic({ resourceGroup, appName, image, revisionSuffix, exposed }) {
  await ensureMultipleRevisionMode(resourceGroup, appName);

  const beforeShow = await runJson("az", [
    "containerapp",
    "show",
    "--resource-group",
    resourceGroup,
    "--name",
    appName,
    "--only-show-errors",
    "--output",
    "json"
  ]);
  const previousLatestRevisionName = String(
    beforeShow?.properties?.latestRevisionName || ""
  ).trim();

  const trafficBefore = await runJson("az", [
    "containerapp",
    "ingress",
    "traffic",
    "show",
    "--resource-group",
    resourceGroup,
    "--name",
    appName,
    "--only-show-errors",
    "--output",
    "json"
  ]);

  const update = await runJson("az", [
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
    "--only-show-errors",
    "--output",
    "json"
  ]);

  const newRevisionName = String(update?.properties?.latestRevisionName || "").trim();
  if (!newRevisionName) {
    throw new Error(`Unable to resolve latest revision name for ${appName}`);
  }

  const revisionWeights = normalizeRevisionWeights(
    trafficBefore,
    newRevisionName,
    previousLatestRevisionName
  );

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
    ...buildRevisionWeightArgs(revisionWeights),
    "--only-show-errors",
    "--output",
    "none"
  ]);

  let revisionFqdn = "";
  if (exposed) {
    const { stdout } = await run("az", [
      "containerapp",
      "revision",
      "show",
      "--resource-group",
      resourceGroup,
      "--name",
      appName,
      "--revision",
      newRevisionName,
      "--query",
      "properties.fqdn",
      "--output",
      "tsv",
      "--only-show-errors"
    ]);
    revisionFqdn = stdout.trim();
    if (!revisionFqdn) {
      throw new Error(`Unable to resolve revision FQDN for ${appName}/${newRevisionName}`);
    }
  }

  return {
    appName,
    image,
    previousLatestRevisionName,
    revisionName: newRevisionName,
    revisionFqdn,
    traffic: revisionWeights
  };
}

async function main() {
  const headSha = getHeadSha();
  const resourceGroup = requireEnv("AZURE_RESOURCE_GROUP");
  const apiAppName = requireEnv("ACA_API_APP_NAME");
  const webAppName = requireEnv("ACA_WEB_APP_NAME");
  const apiImage = requireEnv("API_IMAGE");
  const webImage = requireEnv("WEB_IMAGE");

  const revisionSuffixBase = process.env.REVISION_SUFFIX?.trim() || headSha.slice(0, 10);
  const revisionSuffix = revisionSuffixBase.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 20);
  if (!revisionSuffix) {
    throw new Error("Unable to derive a valid revision suffix");
  }

  const api = await stageAppZeroTraffic({
    resourceGroup,
    appName: apiAppName,
    image: apiImage,
    revisionSuffix: `api-${revisionSuffix}`.slice(0, 20),
    exposed: true
  });

  const web = await stageAppZeroTraffic({
    resourceGroup,
    appName: webAppName,
    image: webImage,
    revisionSuffix: `web-${revisionSuffix}`.slice(0, 20),
    exposed: true
  });

  const payload = {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    mode: "zero-traffic-predeploy",
    predeployedRevisions: {
      api,
      web
    }
  };

  const artifactPath = await writeDeployArtifact("zero-traffic-predeploy", payload);

  await appendGithubOutput({
    artifact_path: artifactPath,
    predeployed_revisions_json: JSON.stringify(payload.predeployedRevisions),
    api_revision_url: `https://${api.revisionFqdn}`,
    web_revision_url: `https://${web.revisionFqdn}`
  });
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
