import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import { deployCandidateAzure } from "../../../shared/scripts/azure/deploy-candidate-azure.mjs";

export async function deployAcceptanceCandidate({
  manifestPath,
  resourceGroup,
  apiAppName,
  webAppName,
  workerAppName,
  migrationsJobName,
  outPath
}) {
  await deployCandidateAzure({
    manifestPath,
    resourceGroup,
    apiAppName,
    webAppName,
    workerAppName,
    migrationsJobName,
    zeroTraffic: false,
    outPath
  });
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  await deployAcceptanceCandidate({
    manifestPath: requireOption(options, "manifest"),
    resourceGroup: requireOption(options, "resource-group"),
    apiAppName: requireOption(options, "api-app-name"),
    webAppName: requireOption(options, "web-app-name"),
    workerAppName: requireOption(options, "worker-app-name"),
    migrationsJobName: requireOption(options, "migrations-job-name"),
    outPath: requireOption(options, "out")
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
