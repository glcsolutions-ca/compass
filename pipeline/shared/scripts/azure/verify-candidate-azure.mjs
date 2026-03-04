import { pathToFileURL } from "node:url";
import { parseCliArgs, optionalOption, requireOption } from "../cli-utils.mjs";
import { readJsonFile } from "../pipeline-contract-lib.mjs";
import { validateReleaseCandidateFile } from "../validate-release-candidate.mjs";
import { ensureAzLogin, runAz } from "./az-command.mjs";

const REQUEST_TIMEOUT_MS = 15_000;

function normalizeBoolean(value) {
  if (value === true) {
    return true;
  }

  if (typeof value !== "string") {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function ensureImagePinned(showDocument, expectedImage, appName) {
  const containers = showDocument?.properties?.template?.containers;
  if (!Array.isArray(containers)) {
    throw new Error(`Container app ${appName} has no container template`);
  }

  const hasMatch = containers.some((container) => container?.image === expectedImage);
  if (!hasMatch) {
    throw new Error(`Container app ${appName} image mismatch; expected ${expectedImage}`);
  }
}

function ensureZeroTrafficWeight(showDocument, candidateRevision, appName) {
  const traffic = showDocument?.properties?.configuration?.ingress?.traffic;
  if (!Array.isArray(traffic)) {
    throw new Error(`Container app ${appName} has no traffic configuration`);
  }

  const candidateTraffic = traffic.find((entry) => entry?.revisionName === candidateRevision);
  if (!candidateTraffic) {
    throw new Error(
      `Container app ${appName} does not expose candidate revision ${candidateRevision}`
    );
  }

  if (Number(candidateTraffic.weight || 0) !== 0) {
    throw new Error(
      `Container app ${appName} candidate revision ${candidateRevision} is receiving traffic`
    );
  }
}

async function assertUrlResponds(url) {
  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(`Health verification failed for ${url}: HTTP ${response.status}`);
  }
}

function normalizeBaseUrl(urlString) {
  return urlString.replace(/\/$/u, "");
}

export async function verifyCandidateAzure({
  manifestPath,
  deployStatePath,
  resourceGroup,
  apiAppName,
  webAppName,
  workerAppName,
  apiBaseUrl,
  webBaseUrl,
  zeroTraffic
}) {
  const errors = await validateReleaseCandidateFile(manifestPath);
  if (errors.length > 0) {
    const details = errors.map((entry) => `- ${entry.path}: ${entry.message}`).join("\n");
    throw new Error(`Manifest validation failed for Azure verify:\n${details}`);
  }

  await ensureAzLogin();

  const manifest = await readJsonFile(manifestPath);
  const deployState = deployStatePath ? await readJsonFile(deployStatePath) : undefined;

  const apiShow = await runAz([
    "containerapp",
    "show",
    "--resource-group",
    resourceGroup,
    "--name",
    apiAppName
  ]);
  const webShow = await runAz([
    "containerapp",
    "show",
    "--resource-group",
    resourceGroup,
    "--name",
    webAppName
  ]);
  const workerShow = await runAz([
    "containerapp",
    "show",
    "--resource-group",
    resourceGroup,
    "--name",
    workerAppName
  ]);

  const apiExpectedImage = deployState?.deployment?.api?.candidateImage ?? manifest.artifacts.apiImage;
  const webExpectedImage = deployState?.deployment?.web?.candidateImage ?? manifest.artifacts.webImage;
  const workerExpectedImage =
    deployState?.deployment?.worker?.candidateImage ?? manifest.artifacts.workerImage;

  ensureImagePinned(apiShow, apiExpectedImage, apiAppName);
  ensureImagePinned(webShow, webExpectedImage, webAppName);
  ensureImagePinned(workerShow, workerExpectedImage, workerAppName);

  if (zeroTraffic) {
    const deployment = deployState?.deployment;
    if (!deployment?.api?.candidateRevision || !deployment?.web?.candidateRevision) {
      throw new Error(
        "Deploy state with candidate revisions is required for zero-traffic verification"
      );
    }

    ensureZeroTrafficWeight(apiShow, deployment.api.candidateRevision, apiAppName);
    ensureZeroTrafficWeight(webShow, deployment.web.candidateRevision, webAppName);

    const apiRevisionFqdn = deployment.api.candidateRevisionFqdn;
    const webRevisionFqdn = deployment.web.candidateRevisionFqdn;

    if (!apiRevisionFqdn || !webRevisionFqdn) {
      throw new Error("Candidate revision FQDN values are required for zero-traffic verification");
    }

    await assertUrlResponds(`https://${apiRevisionFqdn.replace(/\/$/u, "")}/health`);
    await assertUrlResponds(`https://${webRevisionFqdn.replace(/\/$/u, "")}/`);

    return;
  }

  if (apiBaseUrl) {
    await assertUrlResponds(`${normalizeBaseUrl(apiBaseUrl)}/health`);
  }

  if (webBaseUrl) {
    await assertUrlResponds(`${normalizeBaseUrl(webBaseUrl)}/`);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);

  await verifyCandidateAzure({
    manifestPath: requireOption(options, "manifest"),
    deployStatePath: optionalOption(options, "deploy-state"),
    resourceGroup: requireOption(options, "resource-group"),
    apiAppName: requireOption(options, "api-app-name"),
    webAppName: requireOption(options, "web-app-name"),
    workerAppName: requireOption(options, "worker-app-name"),
    apiBaseUrl: optionalOption(options, "api-base-url"),
    webBaseUrl: optionalOption(options, "web-base-url"),
    zeroTraffic: normalizeBoolean(options["zero-traffic"])
  });

  console.info("Azure candidate verification passed.");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
