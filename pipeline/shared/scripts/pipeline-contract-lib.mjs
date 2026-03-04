import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { validateBySchema } from "./schema-validator.mjs";

export const PATTERNS = {
  candidateId: /^sha-[a-f0-9]{40}$/u,
  sourceRevision: /^[a-f0-9]{40}$/u,
  digestPinnedOciRef:
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*@sha256:[a-f0-9]{64}$/u
};

const FORBIDDEN_RELEASE_FIELDS = new Set([
  "riskClass",
  "deploymentRequired",
  "promotionHalted",
  "acceptancePassed"
]);

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

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateReleaseCandidateDocument(document) {
  const errors = [...validateBySchema("releaseCandidate", document)];

  if (isObject(document)) {
    for (const forbiddenKey of FORBIDDEN_RELEASE_FIELDS) {
      if (Object.hasOwn(document, forbiddenKey)) {
        pushError(errors, `$.${forbiddenKey}`, "is forbidden in release-candidate manifest");
      }
    }
  }

  return normalizeErrors(errors);
}

export function validateAcceptanceAttestationPredicateDocument(document) {
  return normalizeErrors(validateBySchema("acceptanceAttestationPredicate", document));
}

export function validateReleaseAttestationPredicateDocument(document) {
  return normalizeErrors(validateBySchema("releaseAttestationPredicate", document));
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

export function buildCandidateId(sourceRevision) {
  const normalizedRevision = String(sourceRevision || "")
    .trim()
    .toLowerCase();

  if (!PATTERNS.sourceRevision.test(normalizedRevision)) {
    throw new Error("sourceRevision must be a 40-char lowercase SHA");
  }

  return `sha-${normalizedRevision}`;
}
