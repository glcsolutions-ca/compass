import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption, optionalOption } from "../../../shared/scripts/cli-utils.mjs";
import { writeJsonFile } from "../../../shared/scripts/pipeline-contract-lib.mjs";
import { deployCandidateAzure } from "../../../shared/scripts/azure/deploy-candidate-azure.mjs";
import { setBlueGreenTraffic } from "../../../shared/scripts/azure/set-blue-green-traffic.mjs";
import { verifyCandidateAzure } from "../../../shared/scripts/azure/verify-candidate-azure.mjs";

export async function promoteProductionCandidate({
  manifestPath,
  resourceGroup,
  apiAppName,
  webAppName,
  workerAppName,
  migrationsJobName,
  outPath,
  activeLabel,
  inactiveLabel,
  inactiveApiBaseUrl,
  inactiveWebBaseUrl,
  acrName,
  acrLoginServer,
  sourceRegistryUsername,
  sourceRegistryPassword
}) {
  await verifyCandidateAzure({
    manifestPath,
    resourceGroup,
    apiAppName,
    webAppName,
    apiBaseUrl: inactiveApiBaseUrl,
    webBaseUrl: inactiveWebBaseUrl,
    slotLabel: inactiveLabel,
    slotWeight: "0"
  });

  const deploymentState = await deployCandidateAzure({
    manifestPath,
    resourceGroup,
    apiAppName,
    webAppName,
    workerAppName,
    migrationsJobName,
    outPath,
    acrName,
    acrLoginServer,
    sourceRegistryUsername,
    sourceRegistryPassword,
    deployApi: false,
    deployWeb: false,
    deployWorker: true,
    runMigrations: true
  });

  await setBlueGreenTraffic({
    resourceGroup,
    apiAppName,
    webAppName,
    primaryLabel: inactiveLabel,
    primaryWeight: "100",
    secondaryLabel: activeLabel,
    secondaryWeight: "0"
  });

  const enrichedState = {
    ...deploymentState,
    blueGreen: {
      enabled: true,
      activeLabel: inactiveLabel,
      inactiveLabel: activeLabel
    }
  };
  await writeJsonFile(outPath, enrichedState);
  return enrichedState;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);

  await promoteProductionCandidate({
    manifestPath: requireOption(options, "manifest"),
    resourceGroup: requireOption(options, "resource-group"),
    apiAppName: requireOption(options, "api-app-name"),
    webAppName: requireOption(options, "web-app-name"),
    workerAppName: requireOption(options, "worker-app-name"),
    migrationsJobName: requireOption(options, "migrations-job-name"),
    outPath: requireOption(options, "out"),
    activeLabel: requireOption(options, "active-label"),
    inactiveLabel: requireOption(options, "inactive-label"),
    inactiveApiBaseUrl: requireOption(options, "inactive-api-base-url"),
    inactiveWebBaseUrl: requireOption(options, "inactive-web-base-url"),
    acrName: optionalOption(options, "acr-name"),
    acrLoginServer: optionalOption(options, "acr-login-server"),
    sourceRegistryUsername: optionalOption(options, "source-registry-username"),
    sourceRegistryPassword: optionalOption(options, "source-registry-password")
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
