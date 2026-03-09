import path from "node:path";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "./cli-utils.mjs";

const PATTERNS = {
  candidateId: /^sha-[a-f0-9]{40}$/u,
  sourceRevision: /^[a-f0-9]{40}$/u,
  digestPinnedOciRef:
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*@sha256:[a-f0-9]{64}$/u,
  numericString: /^[0-9]+$/u,
  releaseUnitDigest: /^sha256:[a-f0-9]{64}$/u
};

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pushError(errors, pathName, message) {
  errors.push({ path: pathName, message });
}

function validateKnownKeys(errors, value, pathName, allowedKeys) {
  if (!isObject(value)) {
    pushError(errors, pathName, "must be an object");
    return;
  }

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      pushError(errors, `${pathName}.${key}`, "is not allowed");
    }
  }
}

function validateNonEmptyString(errors, value, pathName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    pushError(errors, pathName, "must be a non-empty string");
  }
}

function validateArrayOfNonEmptyStrings(errors, value, pathName) {
  if (!Array.isArray(value)) {
    pushError(errors, pathName, "must be an array");
    return;
  }

  value.forEach((entry, index) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      pushError(errors, `${pathName}[${index}]`, "must be a non-empty string");
    }
  });
}

function validateSource(errors, source) {
  validateKnownKeys(errors, source, "$.source", new Set(["repository", "revision", "createdAt"]));
  if (!isObject(source)) {
    return;
  }

  validateNonEmptyString(errors, source.repository, "$.source.repository");
  if (typeof source.revision !== "string" || !PATTERNS.sourceRevision.test(source.revision)) {
    pushError(errors, "$.source.revision", "must be a 40-char lowercase SHA");
  }
  if (typeof source.createdAt !== "string" || Number.isNaN(Date.parse(source.createdAt))) {
    pushError(errors, "$.source.createdAt", "must be an RFC3339/ISO date-time string");
  }
}

function validateArtifacts(errors, artifacts) {
  validateKnownKeys(
    errors,
    artifacts,
    "$.artifacts",
    new Set(["apiImage", "webImage"])
  );

  if (!isObject(artifacts)) {
    return;
  }

  const refs = {
    apiImage: artifacts.apiImage,
    webImage: artifacts.webImage
  };

  for (const [key, value] of Object.entries(refs)) {
    if (typeof value !== "string" || !PATTERNS.digestPinnedOciRef.test(value)) {
      pushError(errors, `$.artifacts.${key}`, "must be a digest-pinned OCI reference");
    }
  }
}

function validateCommitStageRunId(errors, value) {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 1) {
      pushError(errors, "$.provenance.commitStageRunId", "must be an integer >= 1");
    }
    return;
  }
  if (typeof value === "string") {
    if (!PATTERNS.numericString.test(value)) {
      pushError(errors, "$.provenance.commitStageRunId", "must be numeric");
    }
    return;
  }
  pushError(
    errors,
    "$.provenance.commitStageRunId",
    "must be a positive integer or numeric string"
  );
}

function validateProvenance(errors, provenance) {
  validateKnownKeys(
    errors,
    provenance,
    "$.provenance",
    new Set(["commitStageRunId", "registry", "sbomRefs", "signatureRefs", "releaseUnitDigest"])
  );
  if (!isObject(provenance)) {
    return;
  }

  validateCommitStageRunId(errors, provenance.commitStageRunId);
  validateNonEmptyString(errors, provenance.registry, "$.provenance.registry");

  if (typeof provenance.sbomRefs !== "undefined") {
    validateArrayOfNonEmptyStrings(errors, provenance.sbomRefs, "$.provenance.sbomRefs");
  }
  if (typeof provenance.signatureRefs !== "undefined") {
    validateArrayOfNonEmptyStrings(errors, provenance.signatureRefs, "$.provenance.signatureRefs");
  }
  if (
    typeof provenance.releaseUnitDigest !== "undefined" &&
    (typeof provenance.releaseUnitDigest !== "string" ||
      !PATTERNS.releaseUnitDigest.test(provenance.releaseUnitDigest))
  ) {
    pushError(
      errors,
      "$.provenance.releaseUnitDigest",
      "must match sha256:<64 lowercase hex chars>"
    );
  }
}

export function validateReleaseCandidateRuntimeDocument(document) {
  const errors = [];
  validateKnownKeys(
    errors,
    document,
    "$",
    new Set(["schemaVersion", "candidateId", "source", "artifacts", "provenance"])
  );
  if (!isObject(document)) {
    return errors;
  }
  if (document.schemaVersion !== "rc.v1") {
    pushError(errors, "$.schemaVersion", "must equal rc.v1");
  }
  if (
    typeof document.candidateId !== "string" ||
    !PATTERNS.candidateId.test(document.candidateId)
  ) {
    pushError(errors, "$.candidateId", "must match sha-<40-char lowercase sha>");
  }
  validateSource(errors, document.source);
  validateArtifacts(errors, document.artifacts);
  validateProvenance(errors, document.provenance);
  return errors;
}

export async function validateReleaseCandidateRuntimeFile(filePath) {
  return validateReleaseCandidateRuntimeDocument(JSON.parse(await readFile(filePath, "utf8")));
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const filePath = requireOption(options, "file");
  const errors = await validateReleaseCandidateRuntimeFile(filePath);
  if (errors.length > 0) {
    console.error(`Release-candidate runtime validation failed for ${path.resolve(filePath)}:`);
    for (const entry of errors) {
      console.error(`- ${entry.path}: ${entry.message}`);
    }
    process.exit(1);
  }
  console.info(`Release-candidate runtime validation passed: ${path.resolve(filePath)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
