import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import { writeJsonFile } from "../../../shared/scripts/pipeline-contract-lib.mjs";
import { cleanupBlueGreenRevisions } from "../../../shared/scripts/azure/cleanup-blue-green-revisions.mjs";

export async function cleanupProductionRevisions({
  resourceGroup,
  apiAppName,
  webAppName,
  blueLabel = "blue",
  greenLabel = "green",
  outPath
}) {
  const api = await cleanupBlueGreenRevisions({
    resourceGroup,
    appName: apiAppName,
    blueLabel,
    greenLabel
  });
  const web = await cleanupBlueGreenRevisions({
    resourceGroup,
    appName: webAppName,
    blueLabel,
    greenLabel
  });

  const document = {
    schemaVersion: "release-cleanup.v1",
    resourceGroup,
    blueLabel,
    greenLabel,
    api,
    web
  };

  if (outPath) {
    await writeJsonFile(outPath, document);
  }

  return document;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const result = await cleanupProductionRevisions({
    resourceGroup: requireOption(options, "resource-group"),
    apiAppName: requireOption(options, "api-app-name"),
    webAppName: requireOption(options, "web-app-name"),
    blueLabel: options["blue-label"] || "blue",
    greenLabel: options["green-label"] || "green",
    outPath: options.out
  });

  console.info(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
