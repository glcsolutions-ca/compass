import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import { readJsonFile } from "../../../shared/scripts/pipeline-contract-lib.mjs";
import {
  buildManagedApiEnv,
  buildManagedWebEnv,
  updateContainerApp
} from "./release-azure-lib.mjs";

export async function deployProdAppFromCandidate({
  manifestPath,
  resourceGroup,
  app,
  appName,
  prodApiBaseUrl,
  prodWebBaseUrl
}) {
  const manifest = await readJsonFile(manifestPath);

  if (app === "api") {
    await updateContainerApp({
      resourceGroup,
      appName,
      image: manifest.artifacts.apiImage,
      env: buildManagedApiEnv({
        apiPublicBaseUrl: prodApiBaseUrl,
        webBaseUrl: prodWebBaseUrl
      }),
      minReplicas: 1
    });
    return manifest;
  }

  if (app === "web") {
    await updateContainerApp({
      resourceGroup,
      appName,
      image: manifest.artifacts.webImage,
      env: buildManagedWebEnv({ apiBaseUrl: prodApiBaseUrl }),
      minReplicas: 1
    });
    return manifest;
  }

  throw new Error(`Unsupported production app '${app}'`);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  await deployProdAppFromCandidate({
    manifestPath: requireOption(options, "manifest"),
    resourceGroup: requireOption(options, "resource-group"),
    app: requireOption(options, "app"),
    appName: requireOption(options, "app-name"),
    prodApiBaseUrl: requireOption(options, "prod-api-base-url"),
    prodWebBaseUrl: requireOption(options, "prod-web-base-url")
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
