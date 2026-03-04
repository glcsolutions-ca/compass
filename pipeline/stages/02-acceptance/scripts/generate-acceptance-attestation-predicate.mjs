import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import {
  validateAcceptanceAttestationPredicateDocument,
  writeJsonFile
} from "../../../shared/scripts/pipeline-contract-lib.mjs";

export function createAcceptanceAttestationPredicate(options) {
  const document = {
    schemaVersion: "acceptance-attestation.v1",
    candidateId: options.candidateId.trim(),
    sourceRevision: options.sourceRevision.trim().toLowerCase(),
    verdict: options.verdict.trim(),
    workflowRunId: String(options.workflowRunId).trim(),
    testedAt: options.testedAt.trim(),
    suiteSummary: options.suiteSummary.trim()
  };

  const errors = validateAcceptanceAttestationPredicateDocument(document);
  if (errors.length > 0) {
    const details = errors.map((entry) => `- ${entry.path}: ${entry.message}`).join("\n");
    throw new Error(`Acceptance attestation predicate is invalid:\n${details}`);
  }

  return document;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const outputPath = requireOption(options, "out");

  const document = createAcceptanceAttestationPredicate({
    candidateId: requireOption(options, "candidate-id"),
    sourceRevision: requireOption(options, "source-revision"),
    verdict: requireOption(options, "verdict"),
    workflowRunId: requireOption(options, "workflow-run-id"),
    testedAt: requireOption(options, "tested-at"),
    suiteSummary: requireOption(options, "suite-summary")
  });

  await writeJsonFile(outputPath, document);
  console.info(`Wrote acceptance attestation predicate: ${path.resolve(outputPath)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
