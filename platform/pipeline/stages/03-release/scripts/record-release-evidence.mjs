import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import { readJsonFile, writeJsonFile } from "../../../shared/scripts/pipeline-contract-lib.mjs";

export async function recordReleaseEvidence({
  manifestPath,
  stageApiBaseUrl,
  stageWebBaseUrl,
  stageSmokeVerdict,
  productionWebBaseUrl,
  productionSmokeVerdict,
  outPath
}) {
  const manifest = await readJsonFile(manifestPath);
  const document = {
    schemaVersion: "release-evidence.v1",
    candidateId: manifest.candidateId,
    sourceRevision: manifest.source.revision,
    recordedAt: new Date().toISOString(),
    apiImage: manifest.artifacts.apiImage,
    webImage: manifest.artifacts.webImage,
    stageApiBaseUrl,
    stageWebBaseUrl,
    stageSmokeVerdict,
    productionWebBaseUrl,
    productionSmokeVerdict
  };
  await writeJsonFile(outPath, document);
  return document;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const result = await recordReleaseEvidence({
    manifestPath: requireOption(options, "manifest"),
    stageApiBaseUrl: requireOption(options, "stage-api-base-url"),
    stageWebBaseUrl: requireOption(options, "stage-web-base-url"),
    stageSmokeVerdict: requireOption(options, "stage-smoke-verdict"),
    productionWebBaseUrl: requireOption(options, "production-web-base-url"),
    productionSmokeVerdict: requireOption(options, "production-smoke-verdict"),
    outPath: requireOption(options, "out")
  });
  console.info(`Wrote release evidence: ${path.resolve(requireOption(options, "out"))}`);
  console.info(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
