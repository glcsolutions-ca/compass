import { pathToFileURL } from 'node:url';
import { optionalOption, parseCliArgs, requireOption } from '../../../shared/scripts/cli-utils.mjs';
import { deployCandidateAzure } from '../../../shared/scripts/azure/deploy-candidate-azure.mjs';

export async function deployProductionRehearsal({
  manifestPath,
  resourceGroup,
  apiAppName,
  webAppName,
  workerAppName,
  migrationsJobName,
  outPath,
  activeLabel,
  inactiveLabel,
  apiFqdn,
  webFqdn,
  acrName,
  acrLoginServer,
  sourceRegistryUsername,
  sourceRegistryPassword
}) {
  await deployCandidateAzure({
    manifestPath,
    resourceGroup,
    apiAppName,
    webAppName,
    workerAppName,
    migrationsJobName,
    outPath,
    activeLabel,
    inactiveLabel,
    apiFqdn,
    webFqdn,
    acrName,
    acrLoginServer,
    sourceRegistryUsername,
    sourceRegistryPassword,
    deployApi: true,
    deployWeb: true,
    deployWorker: false,
    runMigrations: false
  });
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);

  await deployProductionRehearsal({
    manifestPath: requireOption(options, 'manifest'),
    resourceGroup: requireOption(options, 'resource-group'),
    apiAppName: requireOption(options, 'api-app-name'),
    webAppName: requireOption(options, 'web-app-name'),
    workerAppName: requireOption(options, 'worker-app-name'),
    migrationsJobName: requireOption(options, 'migrations-job-name'),
    outPath: requireOption(options, 'out'),
    activeLabel: requireOption(options, 'active-label'),
    inactiveLabel: requireOption(options, 'inactive-label'),
    apiFqdn: requireOption(options, 'api-fqdn'),
    webFqdn: requireOption(options, 'web-fqdn'),
    acrName: optionalOption(options, 'acr-name'),
    acrLoginServer: optionalOption(options, 'acr-login-server'),
    sourceRegistryUsername: optionalOption(options, 'source-registry-username'),
    sourceRegistryPassword: optionalOption(options, 'source-registry-password')
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
