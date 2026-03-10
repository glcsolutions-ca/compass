import { pathToFileURL } from "node:url";
import { loadDeliveryConfig } from "../../../../config/live-config.mjs";

export async function prepareDeploymentContext({ env = process.env } = {}) {
  const config = await loadDeliveryConfig({ env });
  return {
    resourceGroup: config.azureResourceGroup,
    keyVaultName: config.azureKeyVaultName,
    apiProdAppName: config.acaApiProdAppName,
    webProdAppName: config.acaWebProdAppName,
    apiStageAppName: config.acaApiStageAppName,
    webStageAppName: config.acaWebStageAppName,
    migrateJobName: config.acaMigrateJobName,
    productionWebBaseUrl: config.productionWebBaseUrl
  };
}

export async function main() {
  console.info(JSON.stringify(await prepareDeploymentContext(), null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
