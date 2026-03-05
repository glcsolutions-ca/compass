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

function normalizeBaseUrl(urlString) {
  return urlString.replace(/\/$/u, "");
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

function findLabelTraffic(showDocument, label) {
  const traffic = showDocument?.properties?.configuration?.ingress?.traffic;
  if (!Array.isArray(traffic)) {
    return undefined;
  }

  return traffic.find((entry) => entry?.label === label);
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

export async function verifyCandidateAzure({
  manifestPath,
  deployStatePath,
  resourceGroup,
  apiAppName,
  webAppName,
  workerAppName,
  apiBaseUrl,
  webBaseUrl,
  zeroTraffic,
  slotLabel,
  slotWeight
}) {
  const errors = await validateReleaseCandidateFile(manifestPath);
  if (errors.length > 0) {
    const details = errors.map((entry) => `- ${entry.path}: ${entry.message}`).join("\n");
    throw new Error(`Manifest validation failed for Azure verify:\n${details}`);
  }

  await ensureAzLogin();

  const manifest = await readJsonFile(manifestPath);
  const deployState = deployStatePath ? await readJsonFile(deployStatePath) : undefined;
  const expectedSlotWeight = parseExpectedWeight(slotWeight);

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

  const apiExpectedImage =
    deployState?.deployment?.api?.candidateImage ?? manifest.artifacts.apiImage;
  const webExpectedImage =
    deployState?.deployment?.web?.candidateImage ?? manifest.artifacts.webImage;
  const workerExpectedImage =
    deployState?.deployment?.worker?.candidateImage ?? manifest.artifacts.workerImage;

  ensureImagePinned(apiShow, apiExpectedImage, apiAppName);
  ensureImagePinned(webShow, webExpectedImage, webAppName);
  ensureImagePinned(workerShow, workerExpectedImage, workerAppName);

  if (slotLabel) {
    const deployment = deployState?.deployment;
    if (!deployment?.api?.candidateRevision || !deployment?.web?.candidateRevision) {
      throw new Error("Deploy state candidate revisions are required for slot label verification");
    }

    const apiSlotTraffic = findLabelTraffic(apiShow, slotLabel);
    const webSlotTraffic = findLabelTraffic(webShow, slotLabel);

    if (!apiSlotTraffic?.revisionName) {
      throw new Error(`API app ${apiAppName} does not expose slot label '${slotLabel}'`);
    }

    if (!webSlotTraffic?.revisionName) {
      throw new Error(`Web app ${webAppName} does not expose slot label '${slotLabel}'`);
    }

    if (apiSlotTraffic.revisionName !== deployment.api.candidateRevision) {
      throw new Error(
        `API slot '${slotLabel}' revision mismatch. expected=${deployment.api.candidateRevision} actual=${apiSlotTraffic.revisionName}`
      );
    }

    if (webSlotTraffic.revisionName !== deployment.web.candidateRevision) {
      throw new Error(
        `Web slot '${slotLabel}' revision mismatch. expected=${deployment.web.candidateRevision} actual=${webSlotTraffic.revisionName}`
      );
    }

    if (typeof expectedSlotWeight === "number") {
      if (Number(apiSlotTraffic.weight || 0) !== expectedSlotWeight) {
        throw new Error(
          `API slot '${slotLabel}' has unexpected traffic weight ${Number(apiSlotTraffic.weight || 0)} (expected ${expectedSlotWeight})`
        );
      }

      if (Number(webSlotTraffic.weight || 0) !== expectedSlotWeight) {
        throw new Error(
          `Web slot '${slotLabel}' has unexpected traffic weight ${Number(webSlotTraffic.weight || 0)} (expected ${expectedSlotWeight})`
        );
      }
    }

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
    zeroTraffic: normalizeBoolean(options["zero-traffic"]),
    slotLabel: optionalOption(options, "slot-label"),
    slotWeight: optionalOption(options, "slot-weight")
  });

  console.info("Azure candidate verification passed.");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
