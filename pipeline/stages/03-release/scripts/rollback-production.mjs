import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import { fetchReleaseCandidate } from "../../../shared/scripts/fetch-release-candidate.mjs";
import { deployStageFromCandidate } from "./deploy-stage-from-candidate.mjs";
import { runStageSmoke } from "./run-stage-smoke.mjs";
import { runProductionMigrations } from "./run-production-migrations.mjs";
import { deployProdFromCandidate } from "./deploy-prod-from-candidate.mjs";
import { runProductionSmoke } from "./run-production-smoke.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function rollbackProduction({
  candidateId,
  resourceGroup,
  apiProdAppName,
  webProdAppName,
  apiStageAppName,
  webStageAppName,
  migrateJobName,
  stageApiBaseUrl,
  stageWebBaseUrl,
  prodApiBaseUrl,
  productionWebBaseUrl
}) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "compass-rollback-"));
  const manifestPath = path.join(tempDir, "manifest.json");
  try {
    await fetchReleaseCandidate(
      candidateId,
      manifestPath,
      "ghcr.io/glcsolutions-ca/compass-release-manifests"
    );
    await deployStageFromCandidate({
      manifestPath,
      resourceGroup,
      apiAppName: apiStageAppName,
      webAppName: webStageAppName,
      stageApiBaseUrl
    });
    await runStageSmoke({
      apiBaseUrl: stageApiBaseUrl,
      webBaseUrl: stageWebBaseUrl,
      includeAuth: false
    });
    await runProductionMigrations({ manifestPath, resourceGroup, jobName: migrateJobName });
    await runStageSmoke({
      apiBaseUrl: stageApiBaseUrl,
      webBaseUrl: stageWebBaseUrl,
      includeAuth: true
    });
    await deployProdFromCandidate({
      manifestPath,
      resourceGroup,
      apiAppName: apiProdAppName,
      webAppName: webProdAppName,
      prodApiBaseUrl
    });
    await runProductionSmoke({ webBaseUrl: productionWebBaseUrl });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  await rollbackProduction({
    candidateId: requireOption(options, "candidate-id"),
    resourceGroup: requireOption(options, "resource-group"),
    apiProdAppName: requireOption(options, "api-prod-app-name"),
    webProdAppName: requireOption(options, "web-prod-app-name"),
    apiStageAppName: requireOption(options, "api-stage-app-name"),
    webStageAppName: requireOption(options, "web-stage-app-name"),
    migrateJobName: requireOption(options, "migrate-job-name"),
    stageApiBaseUrl: requireOption(options, "stage-api-base-url"),
    stageWebBaseUrl: requireOption(options, "stage-web-base-url"),
    prodApiBaseUrl: requireOption(options, "prod-api-base-url"),
    productionWebBaseUrl: requireOption(options, "production-web-base-url")
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
