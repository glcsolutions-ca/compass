import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { appendGithubOutput, getCurrentSha, writeJsonFile } from "./utils.mjs";

const execFileAsync = promisify(execFile);

const SKIPPED_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".eot",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".pdf",
  ".png",
  ".ttf",
  ".webp",
  ".woff",
  ".woff2",
  ".zip"
]);

const SKIPPED_PATHS = new Set(["scripts/ci/no-org-infra-leak.mjs"]);

const SENSITIVE_ASSIGNMENT_KEYS = [
  "AZURE_TENANT_ID",
  "AZURE_SUBSCRIPTION_ID",
  "AZURE_RESOURCE_GROUP",
  "AZURE_LOCATION",
  "AZURE_VNET_NAME",
  "AZURE_ACA_SUBNET_NAME",
  "AZURE_POSTGRES_SUBNET_NAME",
  "AZURE_PRIVATE_DNS_ZONE_NAME",
  "ACA_ENVIRONMENT_NAME",
  "AZURE_LOG_ANALYTICS_WORKSPACE_NAME",
  "ACA_API_APP_NAME",
  "ACA_WEB_APP_NAME",
  "ACA_MIGRATE_JOB_NAME",
  "ACR_NAME",
  "ACR_LOGIN_SERVER",
  "POSTGRES_SERVER_NAME",
  "POSTGRES_DATABASE_NAME",
  "POSTGRES_ADMIN_USERNAME",
  "GH_ORGANIZATION",
  "GH_REPOSITORY_NAME",
  "ENTRA_ISSUER",
  "ENTRA_JWKS_URI",
  "ENTRA_AUDIENCE"
];

const SENSITIVE_TFVARS_KEYS = new Set([
  "github_organization",
  "github_repository",
  "api_identifier_uri"
]);

const SENSITIVE_BICEP_PARAMS = new Set([
  "location",
  "vnetName",
  "acaSubnetName",
  "postgresSubnetName",
  "privateDnsZoneName",
  "environmentName",
  "logAnalyticsWorkspaceName",
  "apiAppName",
  "webAppName",
  "migrationJobName",
  "acrName",
  "postgresServerName",
  "postgresDatabaseName",
  "postgresAdminUsername",
  "databaseUrl",
  "postgresAdminPassword",
  "apiImage",
  "webImage",
  "migrateImage",
  "entraIssuer",
  "entraAudience",
  "entraJwksUri"
]);

const FORBIDDEN_LINE_PATTERNS = [
  {
    id: "inline-azure-guid",
    regex:
      /\b(AZURE_TENANT_ID|AZURE_SUBSCRIPTION_ID|tenant-id|subscription-id)\b\s*[:=]\s*["']?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    reason: "Azure tenant/subscription GUID literals must not be committed"
  },
  {
    id: "entra-url-with-guid",
    regex:
      /https:\/\/login\.microsoftonline\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(?:v2\.0|discovery\/v2\.0\/keys)/i,
    reason: "Concrete tenant-specific Entra URL must not be committed"
  },
  {
    id: "caf-prod-name",
    regex: /\b(?:rg|vnet|snet|cae|ca|caj|psql|log)-[a-z0-9]+-prod-canadacentral-[0-9]{2}\b/i,
    reason: "Concrete CAF production resource names must not be committed"
  },
  {
    id: "private-dns-zone-name",
    regex: /\b[a-z0-9-]+\.postgres\.database\.azure\.com\b/i,
    reason: "Concrete private DNS zone name must not be committed"
  },
  {
    id: "acr-login-server-name",
    regex: /\b[a-z0-9]+\.azurecr\.io\b/i,
    reason: "Concrete ACR login server must not be committed"
  }
];

function shouldSkipFile(filePath) {
  if (SKIPPED_PATHS.has(filePath.replaceAll("\\", "/"))) {
    return true;
  }
  const ext = path.extname(filePath).toLowerCase();
  return SKIPPED_EXTENSIONS.has(ext);
}

function normalizeValue(rawValue) {
  return rawValue
    .replace(/[`]/g, "")
    .replace(/\s+#.*$/, "")
    .replace(/\s+\/\/.*$/, "")
    .replace(/[;,]$/, "")
    .trim()
    .replace(/^["']/, "")
    .replace(/["']$/, "")
    .trim();
}

function isPlaceholderValue(rawValue) {
  const value = normalizeValue(rawValue);
  if (value.length === 0) {
    return true;
  }

  return (
    value === "SET_IN_GITHUB_ENV" ||
    value === "REPLACE_IN_WORKFLOW" ||
    /^\$\{\{\s*(vars|secrets)\.[A-Za-z0-9_]+\s*\}\}$/.test(value) ||
    /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(value) ||
    /^\$[A-Za-z_][A-Za-z0-9_]*$/.test(value) ||
    /^<[^>]+>$/.test(value)
  );
}

function findKeyAssignmentFindings(filePath, line, lineNumber) {
  const trimmed = line.trim();
  if (trimmed.startsWith("#") || trimmed.startsWith("//")) {
    return [];
  }

  const findings = [];
  for (const key of SENSITIVE_ASSIGNMENT_KEYS) {
    const assignmentRegex = new RegExp(
      `^\\s*(?:-\\s*)?(?:export\\s+)?[\`"]?${key}[\`"]?\\s*[:=]\\s*(.+?)\\s*$`,
      "i"
    );
    const match = line.match(assignmentRegex);
    if (!match) {
      continue;
    }
    if (!isPlaceholderValue(match[1])) {
      findings.push({
        file: filePath,
        line: lineNumber,
        id: "concrete-sensitive-assignment",
        reason: `Concrete value for ${key} must be sourced from GitHub environment config`,
        excerpt: line.trim().slice(0, 240)
      });
    }
  }
  return findings;
}

function findTfvarsFindings(filePath, line, lineNumber) {
  const findings = [];
  const tfvarsRegex =
    /^\s*(github_organization|github_repository|api_identifier_uri)\s*=\s*(.+?)\s*$/;
  const match = line.match(tfvarsRegex);
  if (!match) {
    return findings;
  }

  const key = match[1];
  const value = match[2];
  if (!SENSITIVE_TFVARS_KEYS.has(key)) {
    return findings;
  }

  if (!isPlaceholderValue(value)) {
    findings.push({
      file: filePath,
      line: lineNumber,
      id: "concrete-sensitive-tfvars-assignment",
      reason: `Concrete value for ${key} in tfvars must be sourced from GitHub environment config`,
      excerpt: line.trim().slice(0, 240)
    });
  }

  return findings;
}

function findBicepParamFindings(filePath, line, lineNumber) {
  const findings = [];
  const bicepParamRegex = /^\s*param\s+([A-Za-z0-9_]+)(?:\s+[A-Za-z0-9_@().]+)?\s*=\s*(.+)$/;
  const match = line.match(bicepParamRegex);
  if (!match) {
    return findings;
  }

  const paramName = match[1];
  const paramValue = match[2];
  if (!SENSITIVE_BICEP_PARAMS.has(paramName)) {
    return findings;
  }

  if (!isPlaceholderValue(paramValue)) {
    findings.push({
      file: filePath,
      line: lineNumber,
      id: "concrete-sensitive-bicep-param",
      reason: `Concrete value for Bicep parameter ${paramName} must not be committed`,
      excerpt: line.trim().slice(0, 240)
    });
  }

  return findings;
}

function findLinePatternFindings(filePath, line, lineNumber) {
  const findings = [];
  for (const pattern of FORBIDDEN_LINE_PATTERNS) {
    if (!pattern.regex.test(line)) {
      continue;
    }

    if (pattern.id === "private-dns-zone-name" && isPlaceholderValue(line)) {
      continue;
    }

    findings.push({
      file: filePath,
      line: lineNumber,
      id: pattern.id,
      reason: pattern.reason,
      excerpt: line.trim().slice(0, 240)
    });
  }

  return findings;
}

function findMatches(filePath, content) {
  const matches = [];
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    matches.push(...findLinePatternFindings(filePath, line, lineNumber));
    matches.push(...findKeyAssignmentFindings(filePath, line, lineNumber));
    matches.push(...findTfvarsFindings(filePath, line, lineNumber));
    matches.push(...findBicepParamFindings(filePath, line, lineNumber));
  }

  return matches;
}

async function getTrackedFiles() {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], { encoding: "utf8" });
  return stdout
    .split("\u0000")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .sort();
}

async function readTextIfSafe(filePath) {
  if (shouldSkipFile(filePath)) {
    return null;
  }

  const buffer = await readFile(filePath);
  if (buffer.includes(0)) {
    return null;
  }

  return buffer.toString("utf8");
}

async function main() {
  const headSha = process.env.HEAD_SHA?.trim() || (await getCurrentSha());
  const tier = process.env.RISK_TIER?.trim() || "t0";
  const files = await getTrackedFiles();

  const findings = [];
  for (const filePath of files) {
    const text = await readTextIfSafe(filePath);
    if (text === null) {
      continue;
    }
    findings.push(...findMatches(filePath, text));
  }

  const status = findings.length === 0 ? "pass" : "fail";
  const resultPath = path.join(".artifacts", "no-org-infra", headSha, "result.json");

  await writeJsonFile(resultPath, {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    tier,
    status,
    findingCount: findings.length,
    findings
  });

  await appendGithubOutput({
    no_org_infra_path: resultPath,
    no_org_infra_status: status
  });

  if (status === "fail") {
    console.error("Blocked: found committed org-specific infrastructure values.");
    for (const finding of findings.slice(0, 20)) {
      console.error(
        `- ${finding.file}:${finding.line} [${finding.id}] ${finding.reason} :: ${finding.excerpt}`
      );
    }
    process.exit(1);
  }

  console.info(`No org-specific infra leaks detected (${resultPath})`);
}

void main();
