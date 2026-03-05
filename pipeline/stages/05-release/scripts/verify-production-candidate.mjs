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

  await verifyProductionCandidate({
    manifestPath: requireOption(options, "manifest"),
    deployStatePath: optionalOption(options, "deploy-state"),
    resourceGroup: requireOption(options, "resource-group"),
    apiAppName: requireOption(options, "api-app-name"),
    webAppName: requireOption(options, "web-app-name"),
    workerAppName: optionalOption(options, "worker-app-name"),
    apiBaseUrl: optionalOption(options, "api-base-url"),
    webBaseUrl: optionalOption(options, "web-base-url"),
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
