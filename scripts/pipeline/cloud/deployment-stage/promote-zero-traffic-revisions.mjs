import {
  appendGithubOutput,
  getHeadSha,
  requireEnv,
  run,
  runJson,
  writeDeployArtifact
} from "./utils.mjs";

function parsePredeployedRevisions(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("must be an object");
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `PREDEPLOYED_REVISIONS_JSON must be valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function buildPromotionWeights(trafficEntries, targetRevisionName) {
  const weights = [{ revisionName: targetRevisionName, weight: 100 }];

  for (const entry of Array.isArray(trafficEntries) ? trafficEntries : []) {
    const revisionName = String(entry?.revisionName || "").trim();
    if (!revisionName || revisionName === targetRevisionName) {
      continue;
    }
    weights.push({ revisionName, weight: 0 });
  }

  return weights;
}

function weightArgs(weights) {
  return weights.map((entry) => `${entry.revisionName}=${entry.weight}`);
}

async function promoteAppRevision({ resourceGroup, appName, targetRevisionName }) {
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

  const weights = buildPromotionWeights(trafficBefore, targetRevisionName);

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
    ...weightArgs(weights),
    "--only-show-errors",
    "--output",
    "none"
  ]);

  const trafficAfter = await runJson("az", [
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

  const targetEntry = (Array.isArray(trafficAfter) ? trafficAfter : []).find(
    (entry) => String(entry?.revisionName || "").trim() === targetRevisionName
  );
  if (!targetEntry || Number(targetEntry.weight ?? 0) !== 100) {
    throw new Error(
      `Promotion verification failed for ${appName}; target revision ${targetRevisionName} is not at 100%`
    );
  }

  return {
    appName,
    targetRevisionName,
    traffic: trafficAfter
  };
}

async function main() {
  const headSha = getHeadSha();
  const resourceGroup = requireEnv("AZURE_RESOURCE_GROUP");
  const predeployed = parsePredeployedRevisions(requireEnv("PREDEPLOYED_REVISIONS_JSON"));

  const apiRevisionName = String(predeployed?.api?.revisionName || "").trim();
  const webRevisionName = String(predeployed?.web?.revisionName || "").trim();
  const apiAppName = String(predeployed?.api?.appName || "").trim();
  const webAppName = String(predeployed?.web?.appName || "").trim();

  if (!apiRevisionName || !webRevisionName || !apiAppName || !webAppName) {
    throw new Error(
      "PREDEPLOYED_REVISIONS_JSON must include api/web appName and revisionName for promotion"
    );
  }

  const api = await promoteAppRevision({
    resourceGroup,
    appName: apiAppName,
    targetRevisionName: apiRevisionName
  });
  const web = await promoteAppRevision({
    resourceGroup,
    appName: webAppName,
    targetRevisionName: webRevisionName
  });

  const payload = {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    mode: "traffic-promotion",
    promotedRevisions: {
      api,
      web
    }
  };

  const artifactPath = await writeDeployArtifact("traffic-promotion", payload);
  await appendGithubOutput({
    artifact_path: artifactPath
  });
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
