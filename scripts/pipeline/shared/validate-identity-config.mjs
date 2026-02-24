import path from "node:path";
import { appendGithubOutput, writeJsonFile } from "./pipeline-utils.mjs";

function parseRequiredEnvNames(raw) {
  if (!raw || raw.trim().length === 0) {
    return [];
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function isApiIdentifierUri(value) {
  return /^api:\/\/[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value);
}

function redactBoolean(value) {
  return value ? "set" : "unset";
}

async function main() {
  const headSha = process.env.HEAD_SHA?.trim() || process.env.GITHUB_SHA?.trim() || "unknown";
  const mode = process.env.IDENTITY_CONFIG_MODE?.trim() || "unspecified";
  const apiIdentifierUri = process.env.API_IDENTIFIER_URI?.trim() || "";
  const legacyAudience = process.env.ENTRA_AUDIENCE?.trim() || "";
  const requiredEnvNames = parseRequiredEnvNames(process.env.REQUIRED_ENV_NAMES);

  const reasons = [];

  for (const name of requiredEnvNames) {
    const value = process.env[name]?.trim();
    if (!value) {
      reasons.push({
        code: "IDENTITY_REQUIRED_ENV_MISSING",
        message: `Missing required identity config value: ${name}`,
        field: name
      });
    }
  }

  if (apiIdentifierUri && legacyAudience && apiIdentifierUri !== legacyAudience) {
    reasons.push({
      code: "IDENTITY_API_IDENTIFIER_URI_CONFLICT",
      message: "API_IDENTIFIER_URI and ENTRA_AUDIENCE are both set but differ.",
      field: "API_IDENTIFIER_URI"
    });
  }

  const resolvedApiIdentifierUri = apiIdentifierUri || legacyAudience;

  if (!resolvedApiIdentifierUri) {
    reasons.push({
      code: "IDENTITY_API_IDENTIFIER_URI_MISSING",
      message: "Set API_IDENTIFIER_URI (preferred) or ENTRA_AUDIENCE (legacy).",
      field: "API_IDENTIFIER_URI"
    });
  } else if (!isApiIdentifierUri(resolvedApiIdentifierUri)) {
    reasons.push({
      code: "IDENTITY_API_IDENTIFIER_URI_INVALID_FORMAT",
      message:
        "API identifier URI must start with 'api://' and contain only URI-safe path characters.",
      field: "API_IDENTIFIER_URI"
    });
  }

  const pass = reasons.length === 0;
  const artifactPath = path.join(".artifacts", "identity", headSha, "config-validation.json");

  const payload = {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    mode,
    pass,
    resolvedApiIdentifierUri,
    reasonCodes: reasons.map((reason) => reason.code),
    reasonDetails: reasons,
    inputSummary: {
      apiIdentifierUri: redactBoolean(Boolean(apiIdentifierUri)),
      entraAudienceLegacy: redactBoolean(Boolean(legacyAudience)),
      requiredEnvNames
    }
  };

  await writeJsonFile(artifactPath, payload);
  await appendGithubOutput({
    api_identifier_uri: resolvedApiIdentifierUri,
    config_contract_status: pass ? "pass" : "fail",
    config_contract_path: artifactPath,
    config_contract_reason_codes_json: JSON.stringify(payload.reasonCodes)
  });

  if (!pass) {
    console.error("identity config contract validation failed:");
    for (const reason of reasons) {
      console.error(`- [${reason.code}] ${reason.message}`);
    }
    process.exit(1);
  }

  console.info(`identity config contract passed (${artifactPath})`);
}

void main();
