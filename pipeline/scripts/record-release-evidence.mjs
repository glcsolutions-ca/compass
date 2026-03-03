import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "./cli-utils.mjs";
import { validateReleaseEvidenceDocument, writeJsonFile } from "./pipeline-contract-lib.mjs";

export function createReleaseEvidence(options) {
  const document = {
    schemaVersion: "release-evidence.v1",
    candidateId: options.candidateId.trim(),
    sourceRevision: options.sourceRevision.trim().toLowerCase(),
    workflowRunId: String(options.workflowRunId).trim(),
    environment: "production",
    verdict: options.verdict.trim(),
    releasedAt: options.releasedAt.trim(),
    summary: options.summary.trim()
  };

  const errors = validateReleaseEvidenceDocument(document);
  if (errors.length > 0) {
    const details = errors.map((entry) => `- ${entry.path}: ${entry.message}`).join("\n");
    throw new Error(`Release evidence is invalid:\n${details}`);
  }

  return document;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const outputPath = requireOption(options, "out");

  const document = createReleaseEvidence({
    candidateId: requireOption(options, "candidate-id"),
    sourceRevision: requireOption(options, "source-revision"),
    workflowRunId: requireOption(options, "workflow-run-id"),
    verdict: requireOption(options, "verdict"),
    releasedAt: requireOption(options, "released-at"),
    summary: requireOption(options, "summary")
  });

  await writeJsonFile(outputPath, document);
  console.info(`Wrote release evidence: ${path.resolve(outputPath)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
