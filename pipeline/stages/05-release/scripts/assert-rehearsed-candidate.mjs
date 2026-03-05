import { pathToFileURL } from 'node:url';
import { parseCliArgs, requireOption } from '../../../shared/scripts/cli-utils.mjs';
import { readJsonFile } from '../../../shared/scripts/pipeline-contract-lib.mjs';
import { validateReleaseCandidateFile } from '../../../shared/scripts/validate-release-candidate.mjs';
import { ensureAzLogin } from '../../../shared/scripts/azure/az-command.mjs';
import { expectedCandidateRevisionName } from '../../../shared/scripts/azure/deploy-candidate-azure.mjs';
import { findLabelTraffic, showContainerApp } from '../../../shared/scripts/azure/blue-green-utils.mjs';

export function assertRehearsedRevisionName({ appName, appKey, candidateId, label, revisionName }) {
  const expectedRevision = expectedCandidateRevisionName(appName, appKey, candidateId);
  if (revisionName !== expectedRevision) {
    throw new Error(
      `Candidate ${candidateId} is not currently rehearsed on ${appName} label '${label}'. expected=${expectedRevision} actual=${revisionName || '<none>'}`
    );
  }

  return expectedRevision;
}

export async function assertRehearsedCandidate({
  manifestPath,
  resourceGroup,
  apiAppName,
  webAppName,
  inactiveLabel
}) {
  const errors = await validateReleaseCandidateFile(manifestPath);
  if (errors.length > 0) {
    const details = errors.map((entry) => `- ${entry.path}: ${entry.message}`).join('\n');
    throw new Error(`Manifest validation failed for rehearsed-candidate assertion:\n${details}`);
  }

  await ensureAzLogin();

  const manifest = await readJsonFile(manifestPath);
  const apiShow = await showContainerApp({ resourceGroup, appName: apiAppName });
  const webShow = await showContainerApp({ resourceGroup, appName: webAppName });

  const apiRevisionName = findLabelTraffic(apiShow, inactiveLabel)?.revisionName || '';
  const webRevisionName = findLabelTraffic(webShow, inactiveLabel)?.revisionName || '';

  assertRehearsedRevisionName({
    appName: apiAppName,
    appKey: 'api',
    candidateId: manifest.candidateId,
    label: inactiveLabel,
    revisionName: apiRevisionName
  });
  assertRehearsedRevisionName({
    appName: webAppName,
    appKey: 'web',
    candidateId: manifest.candidateId,
    label: inactiveLabel,
    revisionName: webRevisionName
  });

  return {
    candidateId: manifest.candidateId,
    inactiveLabel,
    apiRevisionName,
    webRevisionName
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const result = await assertRehearsedCandidate({
    manifestPath: requireOption(options, 'manifest'),
    resourceGroup: requireOption(options, 'resource-group'),
    apiAppName: requireOption(options, 'api-app-name'),
    webAppName: requireOption(options, 'web-app-name'),
    inactiveLabel: requireOption(options, 'inactive-label')
  });

  console.info(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
