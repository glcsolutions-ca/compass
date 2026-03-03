import path from "node:path";
import { pathToFileURL } from "node:url";
import { readdir } from "node:fs/promises";
import { parseCliArgs, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import {
  PATTERNS,
  readJsonFile,
  validateProductionRehearsalEvidenceDocument
} from "../../../shared/scripts/pipeline-contract-lib.mjs";

async function collectFilesRecursive(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFilesRecursive(fullPath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

export async function verifyProductionRehearsalEvidence({
  evidenceDirectory,
  candidateId,
  sourceRevision
}) {
  if (!PATTERNS.candidateId.test(candidateId)) {
    throw new Error(`Invalid candidate id: ${candidateId}`);
  }

  if (!PATTERNS.sourceRevision.test(sourceRevision)) {
    throw new Error(`Invalid source revision: ${sourceRevision}`);
  }

  const files = (await collectFilesRecursive(evidenceDirectory)).filter((filePath) =>
    filePath.endsWith(".json")
  );

  if (files.length === 0) {
    throw new Error("No production rehearsal evidence JSON found");
  }

  const parsedEvidence = [];
  for (const filePath of files) {
    const document = await readJsonFile(filePath);
    const errors = validateProductionRehearsalEvidenceDocument(document);
    if (errors.length > 0) {
      const details = errors.map((entry) => `- ${entry.path}: ${entry.message}`).join("\n");
      throw new Error(`Invalid production rehearsal evidence in ${filePath}:\n${details}`);
    }

    parsedEvidence.push({
      filePath,
      document
    });
  }

  const match = parsedEvidence.find((entry) => entry.document.candidateId === candidateId);
  if (!match) {
    throw new Error(`No production rehearsal evidence found for candidate ${candidateId}`);
  }

  const evidence = match.document;

  if (evidence.sourceRevision !== sourceRevision) {
    throw new Error(
      `Production rehearsal sourceRevision mismatch. expected=${sourceRevision} actual=${evidence.sourceRevision}`
    );
  }

  if (evidence.environment !== "production") {
    throw new Error(`Invalid production rehearsal environment: ${evidence.environment}`);
  }

  if (evidence.stage !== "production-rehearsal") {
    throw new Error(`Invalid production rehearsal stage marker: ${evidence.stage}`);
  }

  if (evidence.verdict !== "pass") {
    throw new Error(`Candidate has not passed production rehearsal: verdict=${evidence.verdict}`);
  }

  if (!evidence.deployment?.zeroTraffic) {
    throw new Error("Production rehearsal evidence must declare zeroTraffic=true");
  }

  console.info(`Production rehearsal evidence verified from ${match.filePath}.`);
  return evidence;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const evidenceDirectory = requireOption(options, "dir");
  const candidateId = requireOption(options, "candidate-id");
  const sourceRevision = requireOption(options, "source-revision");

  await verifyProductionRehearsalEvidence({
    evidenceDirectory,
    candidateId,
    sourceRevision
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
