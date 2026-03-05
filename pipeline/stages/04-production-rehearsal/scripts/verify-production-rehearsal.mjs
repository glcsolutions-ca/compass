import { pathToFileURL } from 'node:url';
import { parseCliArgs, requireOption } from '../../../shared/scripts/cli-utils.mjs';
import { verifyCandidateAzure } from '../../../shared/scripts/azure/verify-candidate-azure.mjs';

export async function verifyProductionRehearsal({
  manifestPath,
  deployStatePath,
  resourceGroup,
  apiAppName,
  webAppName,
  workerAppName,
  apiBaseUrl,
  webBaseUrl,
  slotLabel,
  slotWeight
}) {
  await verifyCandidateAzure({
    manifestPath,
    deployStatePath,
    resourceGroup,
    apiAppName,
    webAppName,
    workerAppName,
    apiBaseUrl,
    webBaseUrl,
    slotLabel,
    slotWeight
  });
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);

  await verifyProductionRehearsal({
    manifestPath: requireOption(options, 'manifest'),
    deployStatePath: requireOption(options, 'deploy-state'),
    resourceGroup: requireOption(options, 'resource-group'),
    apiAppName: requireOption(options, 'api-app-name'),
    webAppName: requireOption(options, 'web-app-name'),
    workerAppName: requireOption(options, 'worker-app-name'),
    apiBaseUrl: requireOption(options, 'api-base-url'),
    webBaseUrl: requireOption(options, 'web-base-url'),
    slotLabel: requireOption(options, 'slot-label'),
    slotWeight: requireOption(options, 'slot-weight')
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
