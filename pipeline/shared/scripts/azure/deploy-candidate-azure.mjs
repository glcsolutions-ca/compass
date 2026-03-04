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

function toRevisionSuffix(candidateId, appKey) {
  const sanitized = candidateId.replace(/[^a-z0-9-]/gu, "").slice(-30);
  return `${appKey}-${sanitized}`.slice(-40);
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

async function deployApp({
  resourceGroup,
  appName,
  expectedImage,
  candidateId,
  appKey,
  zeroTraffic
}) {
  if (zeroTraffic) {
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

  const before = await runAz([
    "containerapp",
    "show",
    "--resource-group",
    resourceGroup,
    "--name",
    appName
  ]);

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
    toRevisionSuffix(candidateId, appKey)
  ]);

  const after = await runAz([
    "containerapp",
    "show",
    "--resource-group",
    resourceGroup,
    "--name",
    appName
  ]);

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
  sourceRegistryPassword
}) {
  const errors = await validateReleaseCandidateFile(manifestPath);
  if (errors.length > 0) {
    const details = errors.map((entry) => `- ${entry.path}: ${entry.message}`).join("\n");
    throw new Error(`Manifest validation failed for Azure deploy:\n${details}`);
  }

  await ensureAzLogin();

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

  const api = await deployApp({
    resourceGroup,
    appName: apiAppName,
    expectedImage: deployedArtifacts.apiImage,
    candidateId: manifest.candidateId,
    appKey: "api",
    zeroTraffic
  });

  const web = await deployApp({
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
    sourceRegistryPassword: optionalOption(options, "source-registry-password")
  });

  console.info(`Deployment state written: ${path.resolve(outPath)}`);
  console.info(
    `Candidate ${deploymentState.candidateId} deployed (zeroTraffic=${deploymentState.zeroTraffic}).`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
