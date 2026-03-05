import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCliArgs, optionalOption, requireOption } from '../cli-utils.mjs';
import { readJsonFile, writeJsonFile } from '../pipeline-contract-lib.mjs';
import { validateReleaseCandidateFile } from '../validate-release-candidate.mjs';
import { ensureAzLogin, runAz } from './az-command.mjs';
import {
  buildSlotBaseUrl,
  findCurrentTrafficRevision,
  findLabelTraffic,
  showContainerApp
} from './blue-green-utils.mjs';
import { runMigrationsAzure } from './run-migrations-azure.mjs';
import { setBlueGreenTraffic } from './set-blue-green-traffic.mjs';

function normalizeBoolean(value) {
  if (value === true) {
    return true;
  }

  if (typeof value !== 'string') {
    return false;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function normalizeLabel(label, optionName) {
  const normalized = String(label || '').trim().toLowerCase();
  if (!normalized) {
    throw new Error(`${optionName} is required when blue/green deployment is enabled`);
  }

  if (!/^[a-z0-9-]+$/u.test(normalized)) {
    throw new Error(`${optionName} must contain only lowercase letters, numbers, and '-'`);
  }

  return normalized;
}

function normalizeAppFqdn(fqdn, optionName) {
  const normalized = String(fqdn || '')
    .trim()
    .replace(/^https?:\/\//u, '')
    .replace(/\/+$/u, '');

  if (!normalized) {
    throw new Error(`${optionName} is required when blue/green deployment is enabled`);
  }

  return normalized;
}

function splitImageRef(imageRef) {
  if (typeof imageRef !== 'string' || imageRef.trim().length === 0) {
    throw new Error('Image reference is required');
  }

  const atIndex = imageRef.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === imageRef.length - 1) {
    throw new Error(`Image reference must be digest-pinned (got '${imageRef}')`);
  }

  const repositoryRef = imageRef.slice(0, atIndex);
  const digest = imageRef.slice(atIndex + 1);
  const firstSlash = repositoryRef.indexOf('/');
  if (firstSlash <= 0 || firstSlash === repositoryRef.length - 1) {
    throw new Error(`Image repository is invalid (got '${repositoryRef}')`);
  }

  return {
    repositoryPath: repositoryRef.slice(firstSlash + 1),
    digest
  };
}

function normalizeAcrLoginServer(loginServer) {
  return String(loginServer || '')
    .trim()
    .replace(/^https?:\/\//u, '')
    .replace(/\/+$/u, '');
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

  const args = [
    'acr',
    'import',
    '--name',
    acrName,
    '--source',
    sourceImage,
    '--image',
    targetImage,
    '--force'
  ];

  if (sourceRegistryUsername && sourceRegistryPassword) {
    args.push('--username', sourceRegistryUsername, '--password', sourceRegistryPassword);
  }

  await runAz(args);

  const digest = await runAz(
    ['acr', 'repository', 'show', '--name', acrName, '--image', targetImage, '--query', 'digest'],
    { output: 'tsv' }
  );

  const normalizedDigest = String(digest || '').trim();
  if (!normalizedDigest) {
    throw new Error(`Unable to resolve imported digest for ${targetImage}`);
  }

  return `${normalizeAcrLoginServer(acrLoginServer)}/${repositoryPath}@${normalizedDigest}`;
}

async function resolveDeployedArtifacts({
  artifacts,
  candidateId,
  acrName,
  acrLoginServer,
  sourceRegistryUsername,
  sourceRegistryPassword,
  deployApi,
  deployWeb,
  deployWorker,
  deployMigrations
}) {
  const resolved = {
    apiImage: '',
    webImage: '',
    workerImage: '',
    migrationsArtifact: ''
  };

  const shouldImport = Boolean(acrName || acrLoginServer);
  if (shouldImport && (!acrName || !acrLoginServer)) {
    throw new Error('Both ACR name and ACR login server are required for ACR import');
  }

  const resolveImage = async (imageRef) => {
    if (!shouldImport) {
      return imageRef;
    }

    return importImageToAcr({
      sourceImage: imageRef,
      candidateId,
      acrName,
      acrLoginServer,
      sourceRegistryUsername,
      sourceRegistryPassword
    });
  };

  if (deployApi) {
    resolved.apiImage = await resolveImage(artifacts.apiImage);
  }

  if (deployWeb) {
    resolved.webImage = await resolveImage(artifacts.webImage);
  }

  if (deployWorker) {
    resolved.workerImage = await resolveImage(artifacts.workerImage);
  }

  if (deployMigrations) {
    resolved.migrationsArtifact = await resolveImage(artifacts.migrationsArtifact);
  }

  return resolved;
}

function findImageMatch(showDocument, expectedImage) {
  const containers = showDocument?.properties?.template?.containers;
  if (!Array.isArray(containers)) {
    return false;
  }

  return containers.some((container) => container?.image === expectedImage);
}

async function ensureMultipleRevisionMode({ resourceGroup, appName }) {
  await runAz([
    'containerapp',
    'revision',
    'set-mode',
    '--resource-group',
    resourceGroup,
    '--name',
    appName,
    '--mode',
    'multiple'
  ]);
}

async function ensureLabelAssignment({ resourceGroup, appName, label, revisionName, showDocument }) {
  const currentLabel = findLabelTraffic(showDocument, label);
  if (currentLabel?.revisionName === revisionName) {
    return;
  }

  await runAz([
    'containerapp',
    'revision',
    'label',
    'add',
    '--resource-group',
    resourceGroup,
    '--name',
    appName,
    '--label',
    label,
    '--revision',
    revisionName,
    '--yes'
  ]);
}

async function deployApp({
  resourceGroup,
  appName,
  expectedImage,
  candidateId,
  appKey,
  zeroTraffic = false,
  envVars = []
}) {
  if (zeroTraffic) {
    await ensureMultipleRevisionMode({ resourceGroup, appName });
  }

  const before = await showContainerApp({ resourceGroup, appName });
  const previousRevision =
    findCurrentTrafficRevision(before) ?? before?.properties?.latestRevisionName ?? undefined;

  const updateArgs = [
    'containerapp',
    'update',
    '--resource-group',
    resourceGroup,
    '--name',
    appName,
    '--image',
    expectedImage,
    '--revision-suffix',
    toRevisionSuffix(candidateId, appKey, appName)
  ];

  if (envVars.length > 0) {
    updateArgs.push('--set-env-vars', ...envVars);
  }

  await runAz(updateArgs);

  const after = await showContainerApp({ resourceGroup, appName });
  const candidateRevision = after?.properties?.latestRevisionName;
  const candidateRevisionFqdn = after?.properties?.latestRevisionFqdn;

  if (typeof candidateRevision !== 'string' || candidateRevision.trim().length === 0) {
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
      'containerapp',
      'ingress',
      'traffic',
      'set',
      '--resource-group',
      resourceGroup,
      '--name',
      appName,
      '--revision-weight',
      `${previousRevision}=100`,
      `${candidateRevision}=0`
    ]);
  }

  return {
    appName,
    candidateRevision,
    candidateRevisionFqdn: typeof candidateRevisionFqdn === 'string' ? candidateRevisionFqdn : '',
    previousRevision: previousRevision ?? '',
    candidateImage: expectedImage,
    envVars
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
  envVars = []
}) {
  await ensureMultipleRevisionMode({ resourceGroup, appName });

  const deployment = await deployApp({
    resourceGroup,
    appName,
    expectedImage,
    candidateId,
    appKey,
    envVars
  });

  const showDocument = await showContainerApp({ resourceGroup, appName });
  await ensureLabelAssignment({
    resourceGroup,
    appName,
    label: inactiveLabel,
    revisionName: deployment.candidateRevision,
    showDocument
  });

  const finalState = await showContainerApp({ resourceGroup, appName });

  return {
    ...deployment,
    activeLabel,
    inactiveLabel,
    activeLabelRevision: findLabelTraffic(finalState, activeLabel)?.revisionName ?? '',
    inactiveLabelRevision: findLabelTraffic(finalState, inactiveLabel)?.revisionName ?? ''
  };
}

export function buildBlueGreenSlotEnv({ appKey, inactiveApiBaseUrl }) {
  if (appKey !== 'web') {
    return [];
  }

  return [`API_BASE_URL=${inactiveApiBaseUrl}`];
}

export function toRevisionSuffix(candidateId, appKey, appName) {
  const normalizedAppName = String(appName || '').trim().toLowerCase();
  const maxSuffixLength = 54 - normalizedAppName.length - 2;

  if (maxSuffixLength < 3) {
    throw new Error(`Container app name '${appName}' is too long to derive a valid revision suffix`);
  }

  const normalizedKeyRaw = String(appKey || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/gu, '');
  const normalizedKeyBase = normalizedKeyRaw.length > 0 ? normalizedKeyRaw : 'rev';
  const normalizedKey = /^[a-z]/u.test(normalizedKeyBase)
    ? normalizedKeyBase
    : `r${normalizedKeyBase}`;

  const sanitizedCandidate = String(candidateId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, '');
  const fallbackTail = '0';
  const tailCapacity = Math.max(1, maxSuffixLength - normalizedKey.length - 1);
  const tail = (sanitizedCandidate.slice(-tailCapacity) || fallbackTail).replace(/[^a-z0-9]/gu, '');

  let suffix = `${normalizedKey}-${tail}`;

  if (suffix.length > maxSuffixLength) {
    suffix = suffix.slice(0, maxSuffixLength);
  }

  suffix = suffix.replace(/[^a-z0-9]+$/u, '');
  if (!suffix.endsWith('-') && !/[a-z0-9]$/u.test(suffix)) {
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

export function expectedCandidateRevisionName(appName, appKey, candidateId) {
  return `${appName}--${toRevisionSuffix(candidateId, appKey, appName)}`;
}

export async function deployCandidateAzure({
  manifestPath,
  resourceGroup,
  apiAppName,
  webAppName,
  workerAppName,
  migrationsJobName,
  zeroTraffic = false,
  outPath,
  acrName,
  acrLoginServer,
  sourceRegistryUsername,
  sourceRegistryPassword,
  activeLabel,
  inactiveLabel,
  apiFqdn,
  webFqdn,
  deployApi = true,
  deployWeb = true,
  deployWorker = true,
  runMigrations = true
}) {
  const errors = await validateReleaseCandidateFile(manifestPath);
  if (errors.length > 0) {
    const details = errors.map((entry) => `- ${entry.path}: ${entry.message}`).join('\n');
    throw new Error(`Manifest validation failed for Azure deploy:\n${details}`);
  }

  await ensureAzLogin();

  if (activeLabel || inactiveLabel || apiFqdn || webFqdn) {
    if (!deployApi || !deployWeb) {
      throw new Error('Blue/green deployment requires both API and Web deployment to be enabled');
    }
  }

  const blueGreenEnabled = Boolean(activeLabel || inactiveLabel || apiFqdn || webFqdn);

  if (blueGreenEnabled && zeroTraffic) {
    throw new Error('--zero-traffic cannot be combined with blue/green label deployment options');
  }

  const normalizedActiveLabel = blueGreenEnabled ? normalizeLabel(activeLabel, 'activeLabel') : '';
  const normalizedInactiveLabel = blueGreenEnabled
    ? normalizeLabel(inactiveLabel, 'inactiveLabel')
    : '';
  const normalizedApiFqdn = blueGreenEnabled ? normalizeAppFqdn(apiFqdn, 'apiFqdn') : '';
  const normalizedWebFqdn = blueGreenEnabled ? normalizeAppFqdn(webFqdn, 'webFqdn') : '';

  if (blueGreenEnabled && normalizedActiveLabel === normalizedInactiveLabel) {
    throw new Error('activeLabel and inactiveLabel must be different');
  }

  const manifest = await readJsonFile(manifestPath);
  const deployedArtifacts = await resolveDeployedArtifacts({
    artifacts: manifest.artifacts,
    candidateId: manifest.candidateId,
    acrName,
    acrLoginServer,
    sourceRegistryUsername,
    sourceRegistryPassword,
    deployApi,
    deployWeb,
    deployWorker,
    deployMigrations: runMigrations
  });

  let migrationResult;
  if (runMigrations) {
    migrationResult = await runMigrationsAzure({
      resourceGroup,
      jobName: migrationsJobName,
      migrationsImage: deployedArtifacts.migrationsArtifact
    });
  }

  const deployment = {};
  let blueGreenUrls;

  if (blueGreenEnabled) {
    blueGreenUrls = {
      activeApiBaseUrl: buildSlotBaseUrl(apiAppName, normalizedActiveLabel, normalizedApiFqdn),
      inactiveApiBaseUrl: buildSlotBaseUrl(apiAppName, normalizedInactiveLabel, normalizedApiFqdn),
      activeWebBaseUrl: buildSlotBaseUrl(webAppName, normalizedActiveLabel, normalizedWebFqdn),
      inactiveWebBaseUrl: buildSlotBaseUrl(webAppName, normalizedInactiveLabel, normalizedWebFqdn)
    };
  }

  if (deployApi) {
    deployment.api = blueGreenEnabled
      ? await deployBlueGreenApp({
          resourceGroup,
          appName: apiAppName,
          expectedImage: deployedArtifacts.apiImage,
          candidateId: manifest.candidateId,
          appKey: 'api',
          activeLabel: normalizedActiveLabel,
          inactiveLabel: normalizedInactiveLabel
        })
      : await deployApp({
          resourceGroup,
          appName: apiAppName,
          expectedImage: deployedArtifacts.apiImage,
          candidateId: manifest.candidateId,
          appKey: 'api',
          zeroTraffic
        });
  }

  if (deployWeb) {
    deployment.web = blueGreenEnabled
      ? await deployBlueGreenApp({
          resourceGroup,
          appName: webAppName,
          expectedImage: deployedArtifacts.webImage,
          candidateId: manifest.candidateId,
          appKey: 'web',
          activeLabel: normalizedActiveLabel,
          inactiveLabel: normalizedInactiveLabel,
          envVars: buildBlueGreenSlotEnv({
            appKey: 'web',
            inactiveApiBaseUrl: blueGreenUrls.inactiveApiBaseUrl
          })
        })
      : await deployApp({
          resourceGroup,
          appName: webAppName,
          expectedImage: deployedArtifacts.webImage,
          candidateId: manifest.candidateId,
          appKey: 'web',
          zeroTraffic
        });
  }

  if (blueGreenEnabled) {
    await setBlueGreenTraffic({
      resourceGroup,
      apiAppName,
      webAppName,
      primaryLabel: normalizedActiveLabel,
      primaryWeight: '100',
      secondaryLabel: normalizedInactiveLabel,
      secondaryWeight: '0'
    });
  }

  if (deployWorker) {
    deployment.worker = await deployApp({
      resourceGroup,
      appName: workerAppName,
      expectedImage: deployedArtifacts.workerImage,
      candidateId: manifest.candidateId,
      appKey: 'worker',
      zeroTraffic
    });
  }

  const deploymentState = {
    schemaVersion: 'deploy-state.v2',
    generatedAt: new Date().toISOString(),
    candidateId: manifest.candidateId,
    sourceRevision: manifest.source.revision,
    resourceGroup,
    zeroTraffic,
    artifacts: {
      source: manifest.artifacts,
      deployed: deployedArtifacts
    },
    blueGreen: blueGreenEnabled
      ? {
          enabled: true,
          activeLabel: normalizedActiveLabel,
          inactiveLabel: normalizedInactiveLabel,
          apiFqdn: normalizedApiFqdn,
          webFqdn: normalizedWebFqdn,
          urls: blueGreenUrls
        }
      : {
          enabled: false
        },
    migrations: migrationResult ?? null,
    deployment
  };

  await writeJsonFile(outPath, deploymentState);
  return deploymentState;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const manifestPath = requireOption(options, 'manifest');
  const outPath =
    optionalOption(options, 'out') ?? path.resolve('.artifacts', 'deploy', 'deploy-state.json');

  const deploymentState = await deployCandidateAzure({
    manifestPath,
    resourceGroup: requireOption(options, 'resource-group'),
    apiAppName: requireOption(options, 'api-app-name'),
    webAppName: requireOption(options, 'web-app-name'),
    workerAppName: requireOption(options, 'worker-app-name'),
    migrationsJobName: requireOption(options, 'migrations-job-name'),
    zeroTraffic: normalizeBoolean(options['zero-traffic']),
    outPath,
    acrName: optionalOption(options, 'acr-name'),
    acrLoginServer: optionalOption(options, 'acr-login-server'),
    sourceRegistryUsername: optionalOption(options, 'source-registry-username'),
    sourceRegistryPassword: optionalOption(options, 'source-registry-password'),
    activeLabel: optionalOption(options, 'active-label'),
    inactiveLabel: optionalOption(options, 'inactive-label'),
    apiFqdn: optionalOption(options, 'api-fqdn'),
    webFqdn: optionalOption(options, 'web-fqdn'),
    deployApi: options['deploy-api'] !== 'false',
    deployWeb: options['deploy-web'] !== 'false',
    deployWorker: options['deploy-worker'] !== 'false',
    runMigrations: options['run-migrations'] !== 'false'
  });

  console.info(`Deployment state written: ${path.resolve(outPath)}`);
  console.info(
    `Candidate ${deploymentState.candidateId} deployed (zeroTraffic=${deploymentState.zeroTraffic}, blueGreen=${deploymentState.blueGreen.enabled}).`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
