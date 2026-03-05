import { pathToFileURL } from "node:url";
import { parseCliArgs, optionalOption, requireOption } from "../cli-utils.mjs";
import { readJsonFile } from "../pipeline-contract-lib.mjs";
import { validateReleaseCandidateFile } from "../validate-release-candidate.mjs";
import { ensureAzLogin } from "./az-command.mjs";
import { findLabelTraffic, showContainerApp } from "./blue-green-utils.mjs";

const REQUEST_TIMEOUT_MS = 15_000;

function normalizeBaseUrl(urlString) {
  return String(urlString || "").replace(/\/$/u, "");
}

function parseExpectedWeight(value) {
  if (typeof value === "undefined") {
    return undefined;
  }

  const parsed = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error("--slot-weight must be an integer between 0 and 100");
  }

  return parsed;
}

function ensureImagePinned(showDocument, expectedImage, appName) {
  if (!expectedImage) {
    return;
  }

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

function assertSlotLabel(showDocument, slotLabel, appName, expectedRevision, expectedWeight) {
  const slotTraffic = findLabelTraffic(showDocument, slotLabel);
  if (!slotTraffic?.revisionName) {
    throw new Error(`Container app ${appName} does not expose slot label '${slotLabel}'`);
  }

  if (expectedRevision && slotTraffic.revisionName !== expectedRevision) {
    throw new Error(
      `Container app ${appName} slot '${slotLabel}' revision mismatch. expected=${expectedRevision} actual=${slotTraffic.revisionName}`
    );
  }

  if (typeof expectedWeight === "number" && Number(slotTraffic.weight || 0) !== expectedWeight) {
    throw new Error(
      `Container app ${appName} slot '${slotLabel}' has unexpected traffic weight ${Number(slotTraffic.weight || 0)} (expected ${expectedWeight})`
    );
  }
}

export function assertBlueGreenLabelWeights({ showDocument, appName, activeLabel, inactiveLabel }) {
  const activeWeight = Number(findLabelTraffic(showDocument, activeLabel)?.weight || 0);
  const inactiveWeight = Number(findLabelTraffic(showDocument, inactiveLabel)?.weight || 0);

  if (activeWeight !== 100 || inactiveWeight !== 0) {
    throw new Error(
      `Container app ${appName} has unexpected label weights ${activeLabel}=${activeWeight} ${inactiveLabel}=${inactiveWeight}`
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

async function assertEntraStartRedirect({ webBaseUrl, expectedCallbackBaseUrl }) {
  const authStartUrl = `${normalizeBaseUrl(webBaseUrl)}/v1/auth/entra/start?returnTo=%2F`;
  const response = await fetch(authStartUrl, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  if (response.status < 300 || response.status >= 400) {
    throw new Error(
      `Expected /v1/auth/entra/start to redirect for ${webBaseUrl}, got HTTP ${response.status}`
    );
  }

  const location = response.headers.get("location");
  if (!location) {
    throw new Error(`Missing redirect location from /v1/auth/entra/start at ${webBaseUrl}`);
  }

  const redirectLocation = new URL(location);
  const redirectUri = redirectLocation.searchParams.get("redirect_uri") || "";
  const expectedRedirectUri = `${normalizeBaseUrl(expectedCallbackBaseUrl)}/v1/auth/entra/callback`;

  if (redirectUri !== expectedRedirectUri) {
    throw new Error(
      `Unexpected Entra redirect_uri for ${webBaseUrl}. expected=${expectedRedirectUri} actual=${redirectUri}`
    );
  }
}

function resolveExpectedImages(deployState) {
  return {
    api: deployState?.deployment?.api?.candidateImage ?? "",
    web: deployState?.deployment?.web?.candidateImage ?? "",
    worker: deployState?.deployment?.worker?.candidateImage ?? ""
  };
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
  zeroTraffic = false,
  slotLabel,
  slotWeight
}) {
  const errors = await validateReleaseCandidateFile(manifestPath);
  if (errors.length > 0) {
    const details = errors.map((entry) => `- ${entry.path}: ${entry.message}`).join("\n");
    throw new Error(`Manifest validation failed for Azure verify:\n${details}`);
  }

  await ensureAzLogin();

  const expectedSlotWeight = parseExpectedWeight(slotWeight);
  const deployState = deployStatePath ? await readJsonFile(deployStatePath) : undefined;
  const expectedImages = resolveExpectedImages(deployState);

  const apiShow = await showContainerApp({ resourceGroup, appName: apiAppName });
  const webShow = await showContainerApp({ resourceGroup, appName: webAppName });

  ensureImagePinned(apiShow, expectedImages.api, apiAppName);
  ensureImagePinned(webShow, expectedImages.web, webAppName);

  if (workerAppName && expectedImages.worker) {
    const workerShow = await showContainerApp({ resourceGroup, appName: workerAppName });
    ensureImagePinned(workerShow, expectedImages.worker, workerAppName);
  }

  if (slotLabel) {
    assertSlotLabel(
      apiShow,
      slotLabel,
      apiAppName,
      deployState?.deployment?.api?.candidateRevision,
      expectedSlotWeight
    );
    assertSlotLabel(
      webShow,
      slotLabel,
      webAppName,
      deployState?.deployment?.web?.candidateRevision,
      expectedSlotWeight
    );

    if (!apiBaseUrl || !webBaseUrl) {
      throw new Error("slot label verification requires --api-base-url and --web-base-url");
    }

    await assertUrlResponds(`${normalizeBaseUrl(apiBaseUrl)}/health`);
    await assertUrlResponds(`${normalizeBaseUrl(webBaseUrl)}/`);
    await assertEntraStartRedirect({
      webBaseUrl,
      expectedCallbackBaseUrl: webBaseUrl
    });
    return;
  }

  if (zeroTraffic) {
    const apiRevision = deployState?.deployment?.api?.candidateRevision;
    const webRevision = deployState?.deployment?.web?.candidateRevision;
    const apiRevisionFqdn = deployState?.deployment?.api?.candidateRevisionFqdn;
    const webRevisionFqdn = deployState?.deployment?.web?.candidateRevisionFqdn;

    if (!apiRevision || !webRevision || !apiRevisionFqdn || !webRevisionFqdn) {
      throw new Error(
        "Deploy state candidate revisions and revision FQDNs are required for zero-traffic verification"
      );
    }

    ensureZeroTrafficWeight(apiShow, apiRevision, apiAppName);
    ensureZeroTrafficWeight(webShow, webRevision, webAppName);
    await assertUrlResponds(`https://${apiRevisionFqdn.replace(/\/$/u, "")}/health`);
    await assertUrlResponds(`https://${webRevisionFqdn.replace(/\/$/u, "")}/`);
    return;
  }

  if (deployState?.blueGreen?.enabled) {
    assertBlueGreenLabelWeights({
      showDocument: apiShow,
      appName: apiAppName,
      activeLabel: deployState.blueGreen.activeLabel,
      inactiveLabel: deployState.blueGreen.inactiveLabel
    });
    assertBlueGreenLabelWeights({
      showDocument: webShow,
      appName: webAppName,
      activeLabel: deployState.blueGreen.activeLabel,
      inactiveLabel: deployState.blueGreen.inactiveLabel
    });
  }

  if (apiBaseUrl) {
    await assertUrlResponds(`${normalizeBaseUrl(apiBaseUrl)}/health`);
  }

  if (webBaseUrl) {
    await assertUrlResponds(`${normalizeBaseUrl(webBaseUrl)}/`);
    await assertEntraStartRedirect({
      webBaseUrl,
      expectedCallbackBaseUrl: webBaseUrl
    });
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
    workerAppName: optionalOption(options, "worker-app-name"),
    apiBaseUrl: optionalOption(options, "api-base-url"),
    webBaseUrl: optionalOption(options, "web-base-url"),
    zeroTraffic: options["zero-traffic"] === true,
    slotLabel: optionalOption(options, "slot-label"),
    slotWeight: optionalOption(options, "slot-weight")
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
