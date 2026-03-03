import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u;

export const PATTERNS = {
  candidateId: /^main-[a-f0-9]{7,40}-[0-9]{6,}$/u,
  sourceRevision: /^[a-f0-9]{40}$/u,
  digestPinnedOciRef:
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*@sha256:[a-f0-9]{64}$/u,
  numericString: /^[0-9]+$/u
};

const FORBIDDEN_RELEASE_FIELDS = new Set([
  "riskClass",
  "deploymentRequired",
  "promotionHalted",
  "acceptancePassed"
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIsoUtcDateTime(value) {
  if (typeof value !== "string" || !ISO_UTC_PATTERN.test(value)) {
    return false;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

function normalizeErrors(errors) {
  return errors.map((entry) => ({
    path: entry.path,
    message: entry.message
  }));
}

function pushError(errors, pathName, message) {
  errors.push({
    path: pathName,
    message
  });
}

function validateAllowedKeys(errors, value, allowedKeys, pathName) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      pushError(errors, `${pathName}.${key}`, "is not allowed");
    }
  }
}

function validateRequiredString(errors, value, pathName, { pattern, allowEmpty = false } = {}) {
  if (typeof value !== "string") {
    pushError(errors, pathName, "must be a string");
    return;
  }

  if (!allowEmpty && value.trim().length === 0) {
    pushError(errors, pathName, "must not be empty");
    return;
  }

  if (pattern && !pattern.test(value)) {
    pushError(errors, pathName, `must match ${pattern}`);
  }
}

function validateRunId(errors, value, pathName) {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value <= 0) {
      pushError(errors, pathName, "must be a positive integer");
    }
    return;
  }

  if (typeof value === "string") {
    if (!PATTERNS.numericString.test(value)) {
      pushError(errors, pathName, "must be numeric when provided as a string");
    }
    return;
  }

  pushError(errors, pathName, "must be a positive integer or numeric string");
}

export function validateReleaseCandidateDocument(document) {
  const errors = [];

  if (!isObject(document)) {
    pushError(errors, "$", "must be an object");
    return normalizeErrors(errors);
  }

  for (const forbiddenKey of FORBIDDEN_RELEASE_FIELDS) {
    if (Object.hasOwn(document, forbiddenKey)) {
      pushError(errors, `$.${forbiddenKey}`, "is forbidden in release-candidate manifest");
    }
  }

  const allowedTopLevel = new Set([
    "schemaVersion",
    "candidateId",
    "source",
    "artifacts",
    "provenance"
  ]);
  validateAllowedKeys(errors, document, allowedTopLevel, "$");

  validateRequiredString(errors, document.schemaVersion, "$.schemaVersion");
  if (document.schemaVersion !== "rc.v1") {
    pushError(errors, "$.schemaVersion", "must be 'rc.v1'");
  }

  validateRequiredString(errors, document.candidateId, "$.candidateId", {
    pattern: PATTERNS.candidateId
  });

  if (!isObject(document.source)) {
    pushError(errors, "$.source", "must be an object");
  } else {
    validateAllowedKeys(
      errors,
      document.source,
      new Set(["repository", "revision", "createdAt"]),
      "$.source"
    );
    validateRequiredString(errors, document.source.repository, "$.source.repository");
    validateRequiredString(errors, document.source.revision, "$.source.revision", {
      pattern: PATTERNS.sourceRevision
    });
    validateRequiredString(errors, document.source.createdAt, "$.source.createdAt");
    if (!isIsoUtcDateTime(document.source.createdAt)) {
      pushError(errors, "$.source.createdAt", "must be a valid ISO-8601 UTC timestamp");
    }
  }

  if (!isObject(document.artifacts)) {
    pushError(errors, "$.artifacts", "must be an object");
  } else {
    validateAllowedKeys(
      errors,
      document.artifacts,
      new Set(["apiImage", "webImage", "workerImage", "migrationsArtifact"]),
      "$.artifacts"
    );

    for (const field of ["apiImage", "webImage", "workerImage", "migrationsArtifact"]) {
      validateRequiredString(errors, document.artifacts[field], `$.artifacts.${field}`, {
        pattern: PATTERNS.digestPinnedOciRef
      });
    }
  }

  if (!isObject(document.provenance)) {
    pushError(errors, "$.provenance", "must be an object");
  } else {
    validateAllowedKeys(
      errors,
      document.provenance,
      new Set(["commitStageRunId", "registry", "sbomRefs", "signatureRefs"]),
      "$.provenance"
    );

    validateRunId(errors, document.provenance.commitStageRunId, "$.provenance.commitStageRunId");
    validateRequiredString(errors, document.provenance.registry, "$.provenance.registry");

    for (const arrayField of ["sbomRefs", "signatureRefs"]) {
      const value = document.provenance[arrayField];
      if (typeof value === "undefined") {
        continue;
      }

      if (!Array.isArray(value)) {
        pushError(errors, `$.provenance.${arrayField}`, "must be an array when provided");
        continue;
      }

      for (let index = 0; index < value.length; index += 1) {
        validateRequiredString(errors, value[index], `$.provenance.${arrayField}[${index}]`);
      }
    }
  }

  return normalizeErrors(errors);
}

export function validateAcceptanceEvidenceDocument(document) {
  const errors = [];

  if (!isObject(document)) {
    pushError(errors, "$", "must be an object");
    return normalizeErrors(errors);
  }

  validateAllowedKeys(
    errors,
    document,
    new Set([
      "schemaVersion",
      "candidateId",
      "sourceRevision",
      "workflowRunId",
      "environment",
      "verdict",
      "startedAt",
      "finishedAt",
      "summary"
    ]),
    "$"
  );

  validateRequiredString(errors, document.schemaVersion, "$.schemaVersion");
  if (document.schemaVersion !== "acceptance-evidence.v1") {
    pushError(errors, "$.schemaVersion", "must be 'acceptance-evidence.v1'");
  }

  validateRequiredString(errors, document.candidateId, "$.candidateId", {
    pattern: PATTERNS.candidateId
  });
  validateRequiredString(errors, document.sourceRevision, "$.sourceRevision", {
    pattern: PATTERNS.sourceRevision
  });
  validateRunId(errors, document.workflowRunId, "$.workflowRunId");

  validateRequiredString(errors, document.environment, "$.environment");
  if (document.environment !== "acceptance") {
    pushError(errors, "$.environment", "must be 'acceptance'");
  }

  validateRequiredString(errors, document.verdict, "$.verdict");
  if (!["pass", "fail"].includes(document.verdict)) {
    pushError(errors, "$.verdict", "must be either 'pass' or 'fail'");
  }

  validateRequiredString(errors, document.startedAt, "$.startedAt");
  if (!isIsoUtcDateTime(document.startedAt)) {
    pushError(errors, "$.startedAt", "must be a valid ISO-8601 UTC timestamp");
  }

  validateRequiredString(errors, document.finishedAt, "$.finishedAt");
  if (!isIsoUtcDateTime(document.finishedAt)) {
    pushError(errors, "$.finishedAt", "must be a valid ISO-8601 UTC timestamp");
  }

  validateRequiredString(errors, document.summary, "$.summary");

  return normalizeErrors(errors);
}

export function validateReleaseEvidenceDocument(document) {
  const errors = [];

  if (!isObject(document)) {
    pushError(errors, "$", "must be an object");
    return normalizeErrors(errors);
  }

  validateAllowedKeys(
    errors,
    document,
    new Set([
      "schemaVersion",
      "candidateId",
      "sourceRevision",
      "workflowRunId",
      "environment",
      "verdict",
      "releasedAt",
      "summary"
    ]),
    "$"
  );

  validateRequiredString(errors, document.schemaVersion, "$.schemaVersion");
  if (document.schemaVersion !== "release-evidence.v1") {
    pushError(errors, "$.schemaVersion", "must be 'release-evidence.v1'");
  }

  validateRequiredString(errors, document.candidateId, "$.candidateId", {
    pattern: PATTERNS.candidateId
  });
  validateRequiredString(errors, document.sourceRevision, "$.sourceRevision", {
    pattern: PATTERNS.sourceRevision
  });
  validateRunId(errors, document.workflowRunId, "$.workflowRunId");

  validateRequiredString(errors, document.environment, "$.environment");
  if (document.environment !== "production") {
    pushError(errors, "$.environment", "must be 'production'");
  }

  validateRequiredString(errors, document.verdict, "$.verdict");
  if (!["pass", "fail"].includes(document.verdict)) {
    pushError(errors, "$.verdict", "must be either 'pass' or 'fail'");
  }

  validateRequiredString(errors, document.releasedAt, "$.releasedAt");
  if (!isIsoUtcDateTime(document.releasedAt)) {
    pushError(errors, "$.releasedAt", "must be a valid ISO-8601 UTC timestamp");
  }

  validateRequiredString(errors, document.summary, "$.summary");

  return normalizeErrors(errors);
}

export async function readJsonFile(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function writeJsonFile(filePath, document) {
  const absoluteParent = path.dirname(filePath);
  await mkdir(absoluteParent, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

export function buildCandidateId(sourceRevision, runId) {
  const normalizedRevision = String(sourceRevision || "")
    .trim()
    .toLowerCase();
  const normalizedRunId = String(runId || "").trim();

  if (!PATTERNS.sourceRevision.test(normalizedRevision)) {
    throw new Error("sourceRevision must be a 40-char lowercase SHA");
  }

  if (!PATTERNS.numericString.test(normalizedRunId) || normalizedRunId.length < 6) {
    throw new Error("runId must be numeric and at least 6 digits");
  }

  return `main-${normalizedRevision.slice(0, 7)}-${normalizedRunId}`;
}
