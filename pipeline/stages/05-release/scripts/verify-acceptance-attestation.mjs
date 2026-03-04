import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { parseCliArgs, optionalOption, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import { PATTERNS, readJsonFile } from "../../../shared/scripts/pipeline-contract-lib.mjs";

const execFileAsync = promisify(execFile);

export function findPassingAcceptanceAttestation(entries, options) {
  const { candidateId, sourceRevision, predicateType } = options;

  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("No attestations were returned for verification.");
  }

  for (const entry of entries) {
    const statement = entry?.verificationResult?.statement;
    const predicate = statement?.predicate;

    if (!statement || !predicate) {
      continue;
    }

    if (statement.predicateType !== predicateType) {
      continue;
    }

    if (predicate.candidateId !== candidateId) {
      continue;
    }

    if (predicate.sourceRevision !== sourceRevision) {
      continue;
    }

    if (predicate.verdict !== "pass") {
      continue;
    }

    return predicate;
  }

  throw new Error(
    `No passing acceptance attestation found for ${candidateId} (${sourceRevision}) with predicate ${predicateType}.`
  );
}

async function loadVerificationEntries(options) {
  const verificationJsonPath = optionalOption(options, "verification-json");
  if (verificationJsonPath) {
    return readJsonFile(verificationJsonPath);
  }

  const subject = requireOption(options, "subject");
  const repo = requireOption(options, "repo");
  const predicateType = requireOption(options, "predicate-type");
  const signerWorkflow = optionalOption(options, "signer-workflow");

  const args = [
    "attestation",
    "verify",
    subject,
    "--repo",
    repo,
    "--predicate-type",
    predicateType,
    "--bundle-from-oci",
    "--format",
    "json"
  ];

  if (signerWorkflow) {
    args.push("--signer-workflow", signerWorkflow);
  }

  const result = await execFileAsync("gh", args, {
    env: process.env,
    maxBuffer: 20 * 1024 * 1024
  });

  try {
    return JSON.parse(String(result.stdout || "[]"));
  } catch {
    throw new Error("Unable to parse gh attestation verify JSON output.");
  }
}

export async function verifyAcceptanceAttestation(options) {
  const candidateId = requireOption(options, "candidate-id");
  const sourceRevision = requireOption(options, "source-revision").toLowerCase();
  const predicateType = requireOption(options, "predicate-type");

  if (!PATTERNS.candidateId.test(candidateId)) {
    throw new Error(`Invalid candidate id: ${candidateId}`);
  }

  if (!PATTERNS.sourceRevision.test(sourceRevision)) {
    throw new Error(`Invalid source revision: ${sourceRevision}`);
  }

  const entries = await loadVerificationEntries(options);
  const predicate = findPassingAcceptanceAttestation(entries, {
    candidateId,
    sourceRevision,
    predicateType
  });

  console.info(
    `Verified acceptance attestation for ${predicate.candidateId} (${predicate.sourceRevision}) verdict=${predicate.verdict}.`
  );

  return predicate;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  await verifyAcceptanceAttestation(options);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
