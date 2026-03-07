import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import { readJsonFile } from "../../../shared/scripts/pipeline-contract-lib.mjs";
import { updateContainerApp } from "./release-azure-lib.mjs";

export async function deployStageFromCandidate({
  manifestPath,
  resourceGroup,
  apiAppName,
  webAppName,
  stageApiBaseUrl
}) {
  const manifest = await readJsonFile(manifestPath);
  await Promise.all([
    updateContainerApp({
      resourceGroup,
      appName: apiAppName,
      image: manifest.artifacts.apiImage,
      env: {
        AGENT_GATEWAY_ENABLED: "true",
        AGENT_CLOUD_MODE_ENABLED: "true",
        API_PUBLIC_BASE_URL: stageApiBaseUrl
      },
      minReplicas: 0
    }),
    updateContainerApp({
      resourceGroup,
      appName: webAppName,
      image: manifest.artifacts.webImage,
      env: { API_BASE_URL: stageApiBaseUrl },
      minReplicas: 0
    })
  ]);
  return manifest;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  await deployStageFromCandidate({
    manifestPath: requireOption(options, "manifest"),
    resourceGroup: requireOption(options, "resource-group"),
    apiAppName: requireOption(options, "api-app-name"),
    webAppName: requireOption(options, "web-app-name"),
    stageApiBaseUrl: requireOption(options, "stage-api-base-url")
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
