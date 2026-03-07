import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import {
  validateReleaseAttestationPredicateDocument,
  writeJsonFile
} from "../../../shared/scripts/pipeline-contract-lib.mjs";

export function createReleaseAttestationPredicate(options) {
  const document = {
    schemaVersion: "release-attestation.v2",
    candidateId: options.candidateId.trim(),
    sourceRevision: options.sourceRevision.trim().toLowerCase(),
    verdict: options.verdict.trim(),
    workflowRunId: String(options.workflowRunId).trim(),
    releasedAt: options.releasedAt.trim(),
    environment: "production",
    deploymentRef: options.deploymentRef.trim(),
    apiImage: options.apiImage.trim(),
    webImage: options.webImage.trim(),
    stageApiBaseUrl: options.stageApiBaseUrl.trim(),
    stageWebBaseUrl: options.stageWebBaseUrl.trim(),
    stageSmokeVerdict: options.stageSmokeVerdict.trim(),
    productionWebBaseUrl: options.productionWebBaseUrl.trim(),
    productionSmokeVerdict: options.productionSmokeVerdict.trim()
  };

  const errors = validateReleaseAttestationPredicateDocument(document);
  if (errors.length > 0) {
    throw new Error(
      `Release attestation predicate is invalid:\n${errors
        .map((entry) => `- ${entry.path}: ${entry.message}`)
        .join("\n")}`
    );
  }

  return document;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const outputPath = requireOption(options, "out");
  const document = createReleaseAttestationPredicate({
    candidateId: requireOption(options, "candidate-id"),
    sourceRevision: requireOption(options, "source-revision"),
    verdict: requireOption(options, "verdict"),
    workflowRunId: requireOption(options, "workflow-run-id"),
    releasedAt: requireOption(options, "released-at"),
    deploymentRef: requireOption(options, "deployment-ref"),
    apiImage: requireOption(options, "api-image"),
    webImage: requireOption(options, "web-image"),
    stageApiBaseUrl: requireOption(options, "stage-api-base-url"),
    stageWebBaseUrl: requireOption(options, "stage-web-base-url"),
    stageSmokeVerdict: requireOption(options, "stage-smoke-verdict"),
    productionWebBaseUrl: requireOption(options, "production-web-base-url"),
    productionSmokeVerdict: requireOption(options, "production-smoke-verdict")
  });

  await writeJsonFile(outputPath, document);
  console.info(`Wrote release attestation predicate: ${path.resolve(outputPath)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
