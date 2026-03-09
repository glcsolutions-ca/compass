import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import { readJsonFile } from "../../../shared/scripts/pipeline-contract-lib.mjs";
import { runMigrationsAzure } from "../../../shared/scripts/azure/run-migrations-azure.mjs";

export async function runProductionMigrations({ manifestPath, resourceGroup, jobName }) {
  const manifest = await readJsonFile(manifestPath);
  return runMigrationsAzure({
    resourceGroup,
    jobName,
    migrationsImage: manifest.artifacts.apiImage
  });
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const result = await runProductionMigrations({
    manifestPath: requireOption(options, "manifest"),
    resourceGroup: requireOption(options, "resource-group"),
    jobName: requireOption(options, "job-name")
  });
  console.info(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
