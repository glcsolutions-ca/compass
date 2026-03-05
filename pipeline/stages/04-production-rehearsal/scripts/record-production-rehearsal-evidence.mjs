import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCliArgs, requireOption } from '../../../shared/scripts/cli-utils.mjs';
import {
  validateProductionRehearsalEvidenceDocument,
  writeJsonFile
} from '../../../shared/scripts/pipeline-contract-lib.mjs';

export function createProductionRehearsalEvidence(options) {
  const document = {
    schemaVersion: 'production-rehearsal-evidence.v1',
    candidateId: options.candidateId.trim(),
    sourceRevision: options.sourceRevision.trim().toLowerCase(),
    workflowRunId: String(options.workflowRunId).trim(),
    rehearsedAt: options.rehearsedAt.trim(),
    verdict: options.verdict.trim(),
    environment: 'production-rehearsal',
    activeLabel: options.activeLabel.trim(),
    inactiveLabel: options.inactiveLabel.trim(),
    apiBaseUrl: options.apiBaseUrl.trim(),
    webBaseUrl: options.webBaseUrl.trim(),
    apiRevision: options.apiRevision.trim(),
    webRevision: options.webRevision.trim(),
    summary: options.summary.trim()
  };

  const errors = validateProductionRehearsalEvidenceDocument(document);
  if (errors.length > 0) {
    const details = errors.map((entry) => `- ${entry.path}: ${entry.message}`).join('\n');
    throw new Error(`Production rehearsal evidence is invalid:\n${details}`);
  }

  return document;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const outputPath = requireOption(options, 'out');

  const document = createProductionRehearsalEvidence({
    candidateId: requireOption(options, 'candidate-id'),
    sourceRevision: requireOption(options, 'source-revision'),
    workflowRunId: requireOption(options, 'workflow-run-id'),
    rehearsedAt: requireOption(options, 'rehearsed-at'),
    verdict: requireOption(options, 'verdict'),
    activeLabel: requireOption(options, 'active-label'),
    inactiveLabel: requireOption(options, 'inactive-label'),
    apiBaseUrl: requireOption(options, 'api-base-url'),
    webBaseUrl: requireOption(options, 'web-base-url'),
    apiRevision: requireOption(options, 'api-revision'),
    webRevision: requireOption(options, 'web-revision'),
    summary: requireOption(options, 'summary')
  });

  await writeJsonFile(outputPath, document);
  console.info(`Wrote production rehearsal evidence: ${path.resolve(outputPath)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
