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

function validateCustomDomain(value) {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.includes("://") ||
    normalized.includes("/") ||
    normalized.includes("?") ||
    normalized.includes("#")
  ) {
    return {
      code: "IDENTITY_WEB_CUSTOM_DOMAIN_INVALID_FORMAT",
      message:
        "ACA_WEB_CUSTOM_DOMAIN must be a bare domain name (no scheme, path, query, or fragment).",
      field: "ACA_WEB_CUSTOM_DOMAIN"
    };
  }

  let parsed;
  try {
    parsed = new URL(`https://${normalized}`);
  } catch {
    return {
      code: "IDENTITY_WEB_CUSTOM_DOMAIN_INVALID",
      message: "ACA_WEB_CUSTOM_DOMAIN must be a valid domain name.",
      field: "ACA_WEB_CUSTOM_DOMAIN"
    };
  }

  if (parsed.hostname !== normalized) {
    return {
      code: "IDENTITY_WEB_CUSTOM_DOMAIN_INVALID",
      message: "ACA_WEB_CUSTOM_DOMAIN must be a valid domain name.",
      field: "ACA_WEB_CUSTOM_DOMAIN"
    };
  }

  if (
    parsed.hostname === "0.0.0.0" ||
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1"
  ) {
    return {
      code: "IDENTITY_WEB_CUSTOM_DOMAIN_NON_ROUTABLE",
      message: "ACA_WEB_CUSTOM_DOMAIN must be routable for cloud identity configuration.",
      field: "ACA_WEB_CUSTOM_DOMAIN"
    };
  }

  return null;
}

function redactBoolean(value) {
  return value ? "set" : "unset";
}

async function main() {
  const headSha = process.env.HEAD_SHA?.trim() || process.env.GITHUB_SHA?.trim() || "unknown";
  const mode = process.env.IDENTITY_CONFIG_MODE?.trim() || "unspecified";
  const apiIdentifierUri = process.env.API_IDENTIFIER_URI?.trim() || "";
  const webCustomDomain = process.env.ACA_WEB_CUSTOM_DOMAIN?.trim() || "";
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

  const resolvedApiIdentifierUri = apiIdentifierUri;

  if (!resolvedApiIdentifierUri) {
    reasons.push({
      code: "IDENTITY_API_IDENTIFIER_URI_MISSING",
      message: "Set API_IDENTIFIER_URI.",
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

  if (webCustomDomain) {
    const customDomainError = validateCustomDomain(webCustomDomain);
    if (customDomainError) {
      reasons.push(customDomainError);
    }
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
      webCustomDomain: redactBoolean(Boolean(webCustomDomain)),
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
