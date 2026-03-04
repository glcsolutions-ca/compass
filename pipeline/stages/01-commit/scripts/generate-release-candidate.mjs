import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption, optionalOption } from "../../../shared/scripts/cli-utils.mjs";
import {
  validateReleaseCandidateDocument,
  writeJsonFile,
  buildCandidateId
} from "../../../shared/scripts/pipeline-contract-lib.mjs";

function collectListValues(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter((item) => item.length > 0);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }

  return [];
}

export function createReleaseCandidate(options) {
  const sourceRevision = options.sourceRevision.trim().toLowerCase();
  const runId = String(options.commitStageRunId).trim();
  const candidateId =
    options.candidateId?.trim() && options.candidateId.trim().length > 0
      ? options.candidateId.trim()
      : buildCandidateId(sourceRevision);

  const document = {
    schemaVersion: "rc.v1",
    candidateId,
    source: {
      repository: options.repository.trim(),
      revision: sourceRevision,
      createdAt: options.createdAt ?? new Date().toISOString()
    },
    artifacts: {
      apiImage: options.apiImage.trim(),
      webImage: options.webImage.trim(),
      workerImage: options.workerImage.trim(),
      migrationsArtifact: options.migrationsArtifact.trim()
    },
    provenance: {
      commitStageRunId: runId,
      registry: options.registry.trim()
    }
  };

  const sbomRefs = options.sbomRefs ?? [];
  const signatureRefs = options.signatureRefs ?? [];
  const releaseUnitDigest = options.releaseUnitDigest?.trim();
  if (sbomRefs.length > 0) {
    document.provenance.sbomRefs = sbomRefs;
  }

  if (signatureRefs.length > 0) {
    document.provenance.signatureRefs = signatureRefs;
  }

  if (releaseUnitDigest) {
    document.provenance.releaseUnitDigest = releaseUnitDigest;
  }

  const errors = validateReleaseCandidateDocument(document);
  if (errors.length > 0) {
    const message = errors.map((entry) => `- ${entry.path}: ${entry.message}`).join("\n");
    throw new Error(`Generated release candidate is invalid:\n${message}`);
  }

  return document;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);

  const outputPath = requireOption(options, "out");
  const candidateId = optionalOption(options, "candidate-id");

  const document = createReleaseCandidate({
    candidateId,
    repository: requireOption(options, "repository"),
    sourceRevision: requireOption(options, "source-revision"),
    apiImage: requireOption(options, "api-image"),
    webImage: requireOption(options, "web-image"),
    workerImage: requireOption(options, "worker-image"),
    migrationsArtifact: requireOption(options, "migrations-artifact"),
    registry: requireOption(options, "registry"),
    commitStageRunId: requireOption(options, "commit-stage-run-id"),
    releaseUnitDigest: optionalOption(options, "release-unit-digest"),
    createdAt: optionalOption(options, "created-at"),
    sbomRefs: collectListValues(options["sbom-ref"]),
    signatureRefs: collectListValues(options["signature-ref"])
  });

  await writeJsonFile(outputPath, document);
  console.info(`Wrote release candidate manifest: ${path.resolve(outputPath)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
