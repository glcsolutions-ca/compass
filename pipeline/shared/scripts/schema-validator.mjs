import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

function schemaPath(relativePath) {
  return path.resolve(fileURLToPath(new URL("../../../", import.meta.url)), relativePath);
}

function loadSchema(relativePath) {
  const absolute = schemaPath(relativePath);
  return JSON.parse(readFileSync(absolute, "utf8"));
}

const SCHEMAS = {
  releaseCandidate: loadSchema("pipeline/contracts/schemas/release-candidate.schema.json"),
  acceptanceAttestationPredicate: loadSchema(
    "pipeline/contracts/schemas/acceptance-attestation-predicate.schema.json"
  ),
  productionRehearsalEvidence: loadSchema(
    "pipeline/contracts/schemas/production-rehearsal-evidence.schema.json"
  ),
  releaseAttestationPredicate: loadSchema(
    "pipeline/contracts/schemas/release-attestation-predicate.schema.json"
  )
};

const ajv = new Ajv2020({
  allErrors: true,
  strict: false
});
addFormats(ajv);

const VALIDATORS = {
  releaseCandidate: ajv.compile(SCHEMAS.releaseCandidate),
  acceptanceAttestationPredicate: ajv.compile(SCHEMAS.acceptanceAttestationPredicate),
  productionRehearsalEvidence: ajv.compile(SCHEMAS.productionRehearsalEvidence),
  releaseAttestationPredicate: ajv.compile(SCHEMAS.releaseAttestationPredicate)
};

function toDotPath(instancePath) {
  if (!instancePath || instancePath === "/") {
    return "$";
  }

  const decoded = instancePath
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .map((part) => {
      if (/^[0-9]+$/u.test(part)) {
        return `[${part}]`;
      }
      return `.${part}`;
    })
    .join("");

  return `$${decoded}`;
}

function normalizeAjvError(error) {
  let pathName = toDotPath(error.instancePath);

  if (error.keyword === "required" && error.params?.missingProperty) {
    pathName = `${pathName}.${error.params.missingProperty}`;
  }

  if (error.keyword === "additionalProperties" && error.params?.additionalProperty) {
    pathName = `${pathName}.${error.params.additionalProperty}`;
  }

  return {
    path: pathName,
    message: error.message ?? "is invalid"
  };
}

export function validateBySchema(schemaName, document) {
  const validator = VALIDATORS[schemaName];
  if (!validator) {
    throw new Error(`Unknown schema validator: ${schemaName}`);
  }

  const valid = validator(document);
  if (valid) {
    return [];
  }

  return (validator.errors ?? []).map(normalizeAjvError);
}
