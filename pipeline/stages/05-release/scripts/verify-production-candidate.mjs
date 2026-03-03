import { pathToFileURL } from "node:url";
import { optionalOption, parseCliArgs, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import { verifyCandidateAzure } from "../../../shared/scripts/azure/verify-candidate-azure.mjs";

export async function verifyProductionCandidate({
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
  await verifyCandidateAzure({
    manifestPath,
    deployStatePath,
    resourceGroup,
    apiAppName,
    webAppName,
    workerAppName,
    apiBaseUrl,
    webBaseUrl,
    zeroTraffic
  });
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);

  await verifyProductionCandidate({
    manifestPath: requireOption(options, "manifest"),
    deployStatePath: optionalOption(options, "deploy-state"),
    resourceGroup: requireOption(options, "resource-group"),
    apiAppName: requireOption(options, "api-app-name"),
    webAppName: requireOption(options, "web-app-name"),
    workerAppName: requireOption(options, "worker-app-name"),
    apiBaseUrl: requireOption(options, "api-base-url"),
    webBaseUrl: optionalOption(options, "web-base-url"),
    zeroTraffic: options["zero-traffic"] === true
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
