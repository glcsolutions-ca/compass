import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import {
  validateAcceptanceEvidenceDocument,
  writeJsonFile
} from "../../../shared/scripts/pipeline-contract-lib.mjs";

export function createAcceptanceEvidence(options) {
  const document = {
    schemaVersion: "acceptance-evidence.v1",
    candidateId: options.candidateId.trim(),
    sourceRevision: options.sourceRevision.trim().toLowerCase(),
    workflowRunId: String(options.workflowRunId).trim(),
    environment: "acceptance",
    verdict: options.verdict.trim(),
    startedAt: options.startedAt.trim(),
    finishedAt: options.finishedAt.trim(),
    summary: options.summary.trim()
  };

  const errors = validateAcceptanceEvidenceDocument(document);
  if (errors.length > 0) {
    const details = errors.map((entry) => `- ${entry.path}: ${entry.message}`).join("\n");
    throw new Error(`Acceptance evidence is invalid:\n${details}`);
  }

  return document;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const outputPath = requireOption(options, "out");

  const document = createAcceptanceEvidence({
    candidateId: requireOption(options, "candidate-id"),
    sourceRevision: requireOption(options, "source-revision"),
    workflowRunId: requireOption(options, "workflow-run-id"),
    verdict: requireOption(options, "verdict"),
    startedAt: requireOption(options, "started-at"),
    finishedAt: requireOption(options, "finished-at"),
    summary: requireOption(options, "summary")
  });

  await writeJsonFile(outputPath, document);
  console.info(`Wrote acceptance evidence: ${path.resolve(outputPath)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
