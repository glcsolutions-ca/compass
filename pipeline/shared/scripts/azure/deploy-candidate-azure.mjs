import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseCliArgs, optionalOption, requireOption } from "../cli-utils.mjs";
import { readJsonFile, writeJsonFile } from "../pipeline-contract-lib.mjs";
import { validateReleaseCandidateFile } from "../validate-release-candidate.mjs";
import { ensureAzLogin, runAz } from "./az-command.mjs";
import { runMigrationsAzure } from "./run-migrations-azure.mjs";

function normalizeBoolean(value) {
  if (value === true) {
    return true;
  }

  if (typeof value !== "string") {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function normalizeLabel(label, optionName) {
  const normalized = String(label || "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    throw new Error(`${optionName} is required when blue/green deployment is enabled`);
  }

  if (!/^[a-z0-9-]+$/u.test(normalized)) {
    throw new Error(`${optionName} must contain only lowercase letters, numbers, and '-'`);
  }

  return normalized;
}

function normalizeAppFqdn(fqdn, optionName) {
  const normalized = String(fqdn || "")
    .trim()
    .replace(/^https?:\/\//u, "")
    .replace(/\/+$/u, "");

  if (!normalized) {
    throw new Error(`${optionName} is required when blue/green deployment is enabled`);
  }

  return normalized;
}

function splitAppFqdn(appName, appFqdn) {
  const normalizedName = String(appName || "").trim().toLowerCase();
  const normalizedFqdn = normalizeAppFqdn(appFqdn, "appFqdn");
  const prefix = `${normalizedName}.`;

  if (!normalizedName || !normalizedFqdn || !normalizedFqdn.startsWith(prefix)) {
    throw new Error(`Unable to derive label host from app name '${appName}' and fqdn '${appFqdn}'`);
  }

  return {
    appName: normalizedName,
    domainSuffix: normalizedFqdn.slice(prefix.length)
  };
}

function buildSlotBaseUrl(appName, label, appFqdn) {
  const parsed = splitAppFqdn(appName, appFqdn);
  return `https://${parsed.appName}---${label}.${parsed.domainSuffix}`;
}

export function toRevisionSuffix(candidateId, appKey, appName) {
  const normalizedAppName = String(appName || "")
    .trim()
    .toLowerCase();
  const maxSuffixLength = 54 - normalizedAppName.length - 2;

  if (maxSuffixLength < 3) {
    throw new Error(
      `Container app name '${appName}' is too long to derive a valid revision suffix`
    );
  }

  const normalizedKeyRaw = String(appKey || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/gu, "");
  const normalizedKeyBase = normalizedKeyRaw.length > 0 ? normalizedKeyRaw : "rev";
  const normalizedKey = /^[a-z]/u.test(normalizedKeyBase)
    ? normalizedKeyBase
    : `r${normalizedKeyBase}`;

  const sanitizedCandidate = String(candidateId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, "");
  const fallbackTail = "0";
  const tailCapacity = Math.max(1, maxSuffixLength - normalizedKey.length - 1);
  const tail = (sanitizedCandidate.slice(-tailCapacity) || fallbackTail).replace(/[^a-z0-9]/gu, "");

  let suffix = `${normalizedKey}-${tail}`;

  if (suffix.length > maxSuffixLength) {
    suffix = suffix.slice(0, maxSuffixLength);
  }

  suffix = suffix.replace(/[^a-z0-9]+$/u, "");
  if (!suffix.endsWith("-") && !/[a-z0-9]$/u.test(suffix)) {
    suffix = `${suffix}0`;
  }
  if (!/^[a-z]/u.test(suffix)) {
    suffix = `r${suffix}`.slice(0, maxSuffixLength);
  }
  if (!/[a-z0-9]$/u.test(suffix)) {
    suffix = `${suffix.slice(0, Math.max(0, maxSuffixLength - 1))}0`;
  }

  if (!/^[a-z][a-z0-9-]*[a-z0-9]$/u.test(suffix)) {
    throw new Error(`Unable to generate valid revision suffix for app '${appName}'`);
  }

  return suffix;
}

function findCurrentTrafficRevision(showDocument) {
  const traffic = showDocument?.properties?.configuration?.ingress?.traffic;
  if (!Array.isArray(traffic)) {
    return undefined;
  }

  const active = traffic.find((entry) => Number(entry?.weight || 0) > 0 && entry?.revisionName);
  return typeof active?.revisionName === "string" ? active.revisionName : undefined;
}

function findImageMatch(showDocument, expectedImage) {
  const containers = showDocument?.properties?.template?.containers;
  if (!Array.isArray(containers)) {
    return false;
  }

  return containers.some((container) => container?.image === expectedImage);
}

function findLabelEntry(showDocument, label) {
  const traffic = showDocument?.properties?.configuration?.ingress?.traffic;
  if (!Array.isArray(traffic)) {
    return undefined;
  }

  return traffic.find((entry) => entry?.label === label);
}

function splitImageRef(imageRef) {
  if (typeof imageRef !== "string" || imageRef.trim().length === 0) {
    throw new Error("Image reference is required");
  }

  const atIndex = imageRef.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === imageRef.length - 1) {
    throw new Error(`Image reference must be digest-pinned (got '${imageRef}')`);
  }

  const repositoryRef = imageRef.slice(0, atIndex);
  const digest = imageRef.slice(atIndex + 1);
  const firstSlash = repositoryRef.indexOf("/");
  if (firstSlash <= 0 || firstSlash === repositoryRef.length - 1) {
    throw new Error(`Image repository is invalid (got '${repositoryRef}')`);
  }

  const repositoryPath = repositoryRef.slice(firstSlash + 1);
  return { repositoryPath, digest };
}

function normalizeAcrLoginServer(loginServer) {
  return String(loginServer || "")
    .trim()
    .replace(/^https?:\/\//u, "")
    .replace(/\/+$/u, "");
}

async function importImageToAcr({
  sourceImage,
  candidateId,
  acrName,
  acrLoginServer,
  sourceRegistryUsername,
  sourceRegistryPassword
}) {
  const { repositoryPath } = splitImageRef(sourceImage);
  const tag = candidateId;
  const targetImage = `${repositoryPath}:${tag}`;

  const importArgs = [
    "acr",
    "import",
    "--name",
    acrName,
    "--source",
    sourceImage,
    "--image",
    targetImage,
    "--force"
  ];

  if (sourceRegistryUsername && sourceRegistryPassword) {
    importArgs.push("--username", sourceRegistryUsername, "--password", sourceRegistryPassword);
  }

  await runAz(importArgs);

  const importedDigest = await runAz(
    ["acr", "repository", "show", "--name", acrName, "--image", targetImage, "--query", "digest"],
    { output: "tsv" }
  );

  const digest = String(importedDigest || "").trim();
  if (!digest) {
    throw new Error(`Unable to resolve imported digest for ${targetImage}`);
  }

  return `${normalizeAcrLoginServer(acrLoginServer)}/${repositoryPath}@${digest}`;
}

async function resolveAzureArtifacts({
  artifacts,
  candidateId,
  acrName,
  acrLoginServer,
  sourceRegistryUsername,
  sourceRegistryPassword
}) {
  if (!acrName && !acrLoginServer) {
    return artifacts;
  }

  if (!acrName || !acrLoginServer) {
    throw new Error("Both ACR name and ACR login server are required for ACR import");
  }

  const apiImage = await importImageToAcr({
    sourceImage: artifacts.apiImage,
    candidateId,
    acrName,
    acrLoginServer,
    sourceRegistryUsername,
    sourceRegistryPassword
  });
  const webImage = await importImageToAcr({
    sourceImage: artifacts.webImage,
    candidateId,
    acrName,
    acrLoginServer,
    sourceRegistryUsername,
    sourceRegistryPassword
  });
  const workerImage = await importImageToAcr({
    sourceImage: artifacts.workerImage,
    candidateId,
    acrName,
    acrLoginServer,
    sourceRegistryUsername,
    sourceRegistryPassword
  });
  const migrationsArtifact = await importImageToAcr({
    sourceImage: artifacts.migrationsArtifact,
    candidateId,
    acrName,
    acrLoginServer,
    sourceRegistryUsername,
    sourceRegistryPassword
  });

  return {
    apiImage,
    webImage,
    workerImage,
    migrationsArtifact
  };
}

async function showContainerApp({ resourceGroup, appName }) {
  return runAz(["containerapp", "show", "--resource-group", resourceGroup, "--name", appName]);
}

async function ensureMultipleRevisionMode({ resourceGroup, appName }) {
  await runAz([
    "containerapp",
    "revision",
    "set-mode",
    "--resource-group",
    resourceGroup,
    "--name",
    appName,
    "--mode",
    "multiple"
  ]);
}

async function ensureLabelOnRevision({
  resourceGroup,
  appName,
  label,
  revisionName,
  showDocument
}) {
  const current = findLabelEntry(showDocument, label);
  if (current?.revisionName === revisionName) {
    return;
  }

  await runAz([
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
    "--yes"
  ]);
}

async function setLabelTraffic({ resourceGroup, appName, activeLabel, inactiveLabel }) {
  await runAz([
    "containerapp",
    "ingress",
    "traffic",
    "set",
    "--resource-group",
    resourceGroup,
    "--name",
    appName,
    "--label-weight",
    `${activeLabel}=100`,
    `${inactiveLabel}=0`
  ]);
}

async function deployApp({
  resourceGroup,
  appName,
  expectedImage,
  candidateId,
  appKey,
  zeroTraffic
}) {
  if (zeroTraffic) {
    await ensureMultipleRevisionMode({ resourceGroup, appName });
  }

  const before = await showContainerApp({ resourceGroup, appName });

  const previousRevision =
    findCurrentTrafficRevision(before) ?? before?.properties?.latestRevisionName ?? undefined;

  await runAz([
    "containerapp",
    "update",
    "--resource-group",
    resourceGroup,
    "--name",
    appName,
    "--image",
    expectedImage,
    "--revision-suffix",
    toRevisionSuffix(candidateId, appKey, appName)
  ]);

  const after = await showContainerApp({ resourceGroup, appName });

  const candidateRevision = after?.properties?.latestRevisionName;
  const candidateRevisionFqdn = after?.properties?.latestRevisionFqdn;

  if (typeof candidateRevision !== "string" || candidateRevision.trim().length === 0) {
    throw new Error(`Unable to determine candidate revision for ${appName}`);
  }

  if (!findImageMatch(after, expectedImage)) {
    throw new Error(`Container app ${appName} is not pinned to expected image ${expectedImage}`);
  }

  if (zeroTraffic) {
    if (!previousRevision || previousRevision === candidateRevision) {
      throw new Error(
        `Cannot enforce zero-traffic rehearsal for ${appName}: previous revision unavailable or unchanged`
      );
    }

    await runAz([
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
      `${candidateRevision}=0`
    ]);
  }

  return {
    appName,
    candidateRevision,
    candidateRevisionFqdn: typeof candidateRevisionFqdn === "string" ? candidateRevisionFqdn : "",
    previousRevision: previousRevision ?? "",
    candidateImage: expectedImage
  };
}

async function deployBlueGreenApp({
  resourceGroup,
  appName,
  expectedImage,
  candidateId,
  appKey,
  activeLabel,
  inactiveLabel,
  slotEnvVars
}) {
  await ensureMultipleRevisionMode({ resourceGroup, appName });

  const before = await showContainerApp({ resourceGroup, appName });
  const previousRevision =
    findCurrentTrafficRevision(before) ?? before?.properties?.latestRevisionName ?? undefined;

  if (!previousRevision) {
    throw new Error(`Unable to determine baseline revision for ${appName}`);
  }

  await ensureLabelOnRevision({
    resourceGroup,
    appName,
    label: activeLabel,
    revisionName: previousRevision,
    showDocument: before
  });

  const updateArgs = [
    "containerapp",
    "update",
    "--resource-group",
    resourceGroup,
    "--name",
    appName,
    "--image",
    expectedImage,
    "--revision-suffix",
    toRevisionSuffix(candidateId, appKey, appName)
  ];

  if (slotEnvVars.length > 0) {
    updateArgs.push("--set-env-vars", ...slotEnvVars);
  }

  await runAz(updateArgs);

  const after = await showContainerApp({ resourceGroup, appName });
  const candidateRevision = after?.properties?.latestRevisionName;
  const candidateRevisionFqdn = after?.properties?.latestRevisionFqdn;

  if (typeof candidateRevision !== "string" || candidateRevision.trim().length === 0) {
    throw new Error(`Unable to determine candidate revision for ${appName}`);
  }

  if (!findImageMatch(after, expectedImage)) {
    throw new Error(`Container app ${appName} is not pinned to expected image ${expectedImage}`);
  }

  await ensureLabelOnRevision({
    resourceGroup,
    appName,
    label: inactiveLabel,
    revisionName: candidateRevision,
    showDocument: after
  });

  await setLabelTraffic({ resourceGroup, appName, activeLabel, inactiveLabel });

  const finalized = await showContainerApp({ resourceGroup, appName });
  const activeEntry = findLabelEntry(finalized, activeLabel);
  const inactiveEntry = findLabelEntry(finalized, inactiveLabel);

  return {
    appName,
    candidateRevision,
    candidateRevisionFqdn: typeof candidateRevisionFqdn === "string" ? candidateRevisionFqdn : "",
    previousRevision: previousRevision ?? "",
    candidateImage: expectedImage,
    activeLabel,
    inactiveLabel,
    activeLabelRevision: activeEntry?.revisionName ?? "",
    inactiveLabelRevision: inactiveEntry?.revisionName ?? "",
    slotEnv: slotEnvVars
  };
}

export async function deployCandidateAzure({
  manifestPath,
  resourceGroup,
  apiAppName,
  webAppName,
  workerAppName,
  migrationsJobName,
  zeroTraffic,
  outPath,
  acrName,
  acrLoginServer,
  sourceRegistryUsername,
  sourceRegistryPassword,
  activeLabel,
  inactiveLabel,
  apiFqdn,
  webFqdn
}) {
  const errors = await validateReleaseCandidateFile(manifestPath);
  if (errors.length > 0) {
    const details = errors.map((entry) => `- ${entry.path}: ${entry.message}`).join("\n");
    throw new Error(`Manifest validation failed for Azure deploy:\n${details}`);
  }

  await ensureAzLogin();

  const labelProvided =
    typeof activeLabel === "string" ||
    typeof inactiveLabel === "string" ||
    typeof apiFqdn === "string" ||
    typeof webFqdn === "string";

  const blueGreenEnabled = labelProvided;

  let normalizedActiveLabel;
  let normalizedInactiveLabel;
  let normalizedApiFqdn;
  let normalizedWebFqdn;
  let inactiveApiBaseUrl;
  let inactiveWebBaseUrl;

  if (blueGreenEnabled) {
    if (zeroTraffic) {
      throw new Error("--zero-traffic cannot be combined with blue/green label deployment options");
    }

    normalizedActiveLabel = normalizeLabel(activeLabel, "activeLabel");
    normalizedInactiveLabel = normalizeLabel(inactiveLabel, "inactiveLabel");
    normalizedApiFqdn = normalizeAppFqdn(apiFqdn, "apiFqdn");
    normalizedWebFqdn = normalizeAppFqdn(webFqdn, "webFqdn");

    if (normalizedActiveLabel === normalizedInactiveLabel) {
      throw new Error("activeLabel and inactiveLabel must be different");
    }

    inactiveApiBaseUrl = buildSlotBaseUrl(apiAppName, normalizedInactiveLabel, normalizedApiFqdn);
    inactiveWebBaseUrl = buildSlotBaseUrl(webAppName, normalizedInactiveLabel, normalizedWebFqdn);
  }

  const manifest = await readJsonFile(manifestPath);
  const deployedArtifacts = await resolveAzureArtifacts({
    artifacts: manifest.artifacts,
    candidateId: manifest.candidateId,
    acrName,
    acrLoginServer,
    sourceRegistryUsername,
    sourceRegistryPassword
  });

  const migrationResult = await runMigrationsAzure({
    resourceGroup,
    jobName: migrationsJobName,
    migrationsImage: deployedArtifacts.migrationsArtifact
  });

  const api = blueGreenEnabled
    ? await deployBlueGreenApp({
        resourceGroup,
        appName: apiAppName,
        expectedImage: deployedArtifacts.apiImage,
        candidateId: manifest.candidateId,
        appKey: "api",
        activeLabel: normalizedActiveLabel,
        inactiveLabel: normalizedInactiveLabel,
        slotEnvVars: [`WEB_BASE_URL=${inactiveWebBaseUrl}`]
      })
    : await deployApp({
        resourceGroup,
        appName: apiAppName,
        expectedImage: deployedArtifacts.apiImage,
        candidateId: manifest.candidateId,
        appKey: "api",
        zeroTraffic
      });

  const web = blueGreenEnabled
    ? await deployBlueGreenApp({
        resourceGroup,
        appName: webAppName,
        expectedImage: deployedArtifacts.webImage,
        candidateId: manifest.candidateId,
        appKey: "web",
        activeLabel: normalizedActiveLabel,
        inactiveLabel: normalizedInactiveLabel,
        slotEnvVars: [
          `API_BASE_URL=${inactiveApiBaseUrl}`,
          `VITE_API_BASE_URL=${inactiveApiBaseUrl}`,
          `WEB_BASE_URL=${inactiveWebBaseUrl}`
        ]
      })
    : await deployApp({
        resourceGroup,
        appName: webAppName,
        expectedImage: deployedArtifacts.webImage,
        candidateId: manifest.candidateId,
        appKey: "web",
        zeroTraffic
      });

  const worker = await deployApp({
    resourceGroup,
    appName: workerAppName,
    expectedImage: deployedArtifacts.workerImage,
    candidateId: manifest.candidateId,
    appKey: "worker",
    zeroTraffic
  });

  const deploymentState = {
    schemaVersion: "deploy-state.v1",
    generatedAt: new Date().toISOString(),
    candidateId: manifest.candidateId,
    sourceRevision: manifest.source.revision,
    resourceGroup,
    zeroTraffic,
    blueGreen: blueGreenEnabled
      ? {
          enabled: true,
          activeLabel: normalizedActiveLabel,
          inactiveLabel: normalizedInactiveLabel,
          apiFqdn: normalizedApiFqdn,
          webFqdn: normalizedWebFqdn,
          urls: {
            inactiveApiBaseUrl,
            inactiveWebBaseUrl,
            activeApiBaseUrl: buildSlotBaseUrl(
              apiAppName,
              normalizedActiveLabel,
              normalizedApiFqdn
            ),
            activeWebBaseUrl: buildSlotBaseUrl(
              webAppName,
              normalizedActiveLabel,
              normalizedWebFqdn
            )
          }
        }
      : {
          enabled: false
        },
    artifacts: {
      source: manifest.artifacts,
      deployed: deployedArtifacts
    },
    migrations: migrationResult,
    deployment: {
      api,
      web,
      worker
    }
  };

  await writeJsonFile(outPath, deploymentState);

  return deploymentState;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const manifestPath = requireOption(options, "manifest");
  const outPath =
    optionalOption(options, "out") ?? path.resolve(".artifacts", "deploy", "deploy-state.json");

  const deploymentState = await deployCandidateAzure({
    manifestPath,
    resourceGroup: requireOption(options, "resource-group"),
    apiAppName: requireOption(options, "api-app-name"),
    webAppName: requireOption(options, "web-app-name"),
    workerAppName: requireOption(options, "worker-app-name"),
    migrationsJobName: requireOption(options, "migrations-job-name"),
    zeroTraffic: normalizeBoolean(options["zero-traffic"]),
    outPath,
    acrName: optionalOption(options, "acr-name"),
    acrLoginServer: optionalOption(options, "acr-login-server"),
    sourceRegistryUsername: optionalOption(options, "source-registry-username"),
    sourceRegistryPassword: optionalOption(options, "source-registry-password"),
    activeLabel: optionalOption(options, "active-label"),
    inactiveLabel: optionalOption(options, "inactive-label"),
    apiFqdn: optionalOption(options, "api-fqdn"),
    webFqdn: optionalOption(options, "web-fqdn")
  });

  console.info(`Deployment state written: ${path.resolve(outPath)}`);
  console.info(
    `Candidate ${deploymentState.candidateId} deployed (zeroTraffic=${deploymentState.zeroTraffic}, blueGreen=${deploymentState.blueGreen.enabled}).`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
