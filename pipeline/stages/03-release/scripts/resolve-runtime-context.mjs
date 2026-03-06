import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import { getRuntimeContext } from "./release-azure-lib.mjs";

export async function resolveRuntimeContext({
  resourceGroup,
  apiStageAppName,
  webStageAppName,
  apiProdAppName
}) {
  return getRuntimeContext({
    resourceGroup,
    apiStageAppName,
    webStageAppName,
    apiProdAppName
  });
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const result = await resolveRuntimeContext({
    resourceGroup: requireOption(options, "resource-group"),
    apiStageAppName: requireOption(options, "api-stage-app-name"),
    webStageAppName: requireOption(options, "web-stage-app-name"),
    apiProdAppName: requireOption(options, "api-prod-app-name")
  });
  console.info(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
