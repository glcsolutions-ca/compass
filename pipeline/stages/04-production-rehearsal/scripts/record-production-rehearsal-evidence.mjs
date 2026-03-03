import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import {
  validateProductionRehearsalEvidenceDocument,
  readJsonFile,
  writeJsonFile
} from "../../../shared/scripts/pipeline-contract-lib.mjs";

function toAppEvidence(appState) {
  return {
    appName: String(appState.appName || "").trim(),
    candidateRevision: String(appState.candidateRevision || "").trim(),
    candidateRevisionFqdn: String(appState.candidateRevisionFqdn || "").trim(),
    previousRevision: String(appState.previousRevision || "").trim(),
    candidateImage: String(appState.candidateImage || "").trim()
  };
}

export async function createProductionRehearsalEvidence(options) {
  const deployState = await readJsonFile(options.deployStatePath);

  const document = {
    schemaVersion: "production-rehearsal-evidence.v1",
    stage: "production-rehearsal",
    candidateId: options.candidateId.trim(),
    sourceRevision: options.sourceRevision.trim().toLowerCase(),
    workflowRunId: String(options.workflowRunId).trim(),
    environment: "production",
    verdict: options.verdict.trim(),
    startedAt: options.startedAt.trim(),
    finishedAt: options.finishedAt.trim(),
    summary: options.summary.trim(),
    deployment: {
      resourceGroup: String(deployState.resourceGroup || "").trim(),
      zeroTraffic: Boolean(deployState.zeroTraffic),
      apps: {
        api: toAppEvidence(deployState.deployment?.api || {}),
        web: toAppEvidence(deployState.deployment?.web || {}),
        worker: toAppEvidence(deployState.deployment?.worker || {})
      }
    }
  };

  const errors = validateProductionRehearsalEvidenceDocument(document);
  if (errors.length > 0) {
    const details = errors.map((entry) => `- ${entry.path}: ${entry.message}`).join("\n");
    throw new Error(`Production rehearsal evidence is invalid:\n${details}`);
  }

  return document;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const outputPath = requireOption(options, "out");

  const document = await createProductionRehearsalEvidence({
    deployStatePath: requireOption(options, "deploy-state"),
    candidateId: requireOption(options, "candidate-id"),
    sourceRevision: requireOption(options, "source-revision"),
    workflowRunId: requireOption(options, "workflow-run-id"),
    verdict: requireOption(options, "verdict"),
    startedAt: requireOption(options, "started-at"),
    finishedAt: requireOption(options, "finished-at"),
    summary: requireOption(options, "summary")
  });

  await writeJsonFile(outputPath, document);
  console.info(`Wrote production rehearsal evidence: ${path.resolve(outputPath)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
