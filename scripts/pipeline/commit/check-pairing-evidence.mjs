import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  appendGithubOutput,
  execGit,
  loadPipelinePolicy,
  requireEnv,
  writeJsonFile
} from "../shared/pipeline-utils.mjs";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseTrailerValue(commitMessage, trailerKey) {
  const trailerPattern = new RegExp(`^${escapeRegExp(trailerKey)}:\\s*(.+)$`, "gim");
  let matchedValue = "";
  let match;
  while ((match = trailerPattern.exec(commitMessage)) !== null) {
    const value = String(match[1] || "").trim();
    if (value.length > 0) {
      matchedValue = value;
    }
  }
  return matchedValue;
}

function isValidGithubHandle(value) {
  return /^@[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(value);
}

function parseScopeFromPayload(scopePayload) {
  if (!scopePayload || typeof scopePayload !== "object" || Array.isArray(scopePayload)) {
    return {};
  }

  const nestedScope = scopePayload.scope;
  if (!nestedScope || typeof nestedScope !== "object" || Array.isArray(nestedScope)) {
    return {};
  }

  return nestedScope;
}

function parseBooleanFlag(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return null;
}

function deriveScopeFromEnv(highRiskScopes) {
  const scope = {};
  let hasAny = false;

  for (const scopeKey of highRiskScopes) {
    const envName = `SCOPE_${String(scopeKey)
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .toUpperCase()}`;
    const parsed = parseBooleanFlag(process.env[envName]);
    if (parsed === null) {
      continue;
    }
    scope[scopeKey] = parsed;
    hasAny = true;
  }

  if (!hasAny) {
    return null;
  }

  return scope;
}

async function main() {
  const headSha = requireEnv("HEAD_SHA");
  const eventName = (process.env.EVENT_NAME || process.env.GITHUB_EVENT_NAME || "").trim();
  const headBranch = (process.env.HEAD_BRANCH || process.env.GITHUB_REF_NAME || "").trim();
  const scopePath = requireEnv("SCOPE_PATH");
  const policyPath =
    process.env.PIPELINE_POLICY_PATH ?? path.join(".github", "policy", "pipeline-policy.json");
  const policy = await loadPipelinePolicy(policyPath);

  const trailerKey = String(policy.pairingPolicy?.trailerKey || "Paired-With").trim();
  const highRiskScopes = Array.isArray(policy.pairingPolicy?.highRiskScopes)
    ? policy.pairingPolicy.highRiskScopes
    : [];

  let scope = deriveScopeFromEnv(highRiskScopes);
  if (!scope) {
    const scopePayload = JSON.parse(await readFile(scopePath, "utf8"));
    scope = parseScopeFromPayload(scopePayload);
  }

  const matchedHighRiskScopes = highRiskScopes.filter((scopeKey) => scope[scopeKey] === true);
  const pairingRequired =
    eventName === "push" && headBranch === "main" && matchedHighRiskScopes.length > 0;

  const resultPath = path.join(".artifacts", "pairing-evidence", headSha, "result.json");
  const basePayload = {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    eventName,
    headBranch,
    policyPath,
    trailerKey,
    highRiskScopes,
    matchedHighRiskScopes,
    pairingRequired
  };

  if (!pairingRequired) {
    await writeJsonFile(resultPath, {
      ...basePayload,
      pass: true,
      status: "not-required",
      reasonCodes: ["PAIRING_NOT_REQUIRED"],
      reasonDetails: [
        {
          code: "PAIRING_NOT_REQUIRED",
          message: "pairing evidence is only required for high-risk push events on main"
        }
      ]
    });

    await appendGithubOutput({
      pairing_required: "false",
      pairing_status: "not-required",
      trailer_key: trailerKey,
      high_risk_scopes: JSON.stringify(highRiskScopes),
      pairing_evidence_path: resultPath
    });
    return;
  }

  const commitMessage = await execGit(["log", "-1", "--pretty=%B", headSha]);
  const pairedWith = parseTrailerValue(commitMessage, trailerKey);
  const reasons = [];

  if (pairedWith.length === 0) {
    reasons.push({
      code: "PAIRING_TRAILER_MISSING",
      message: `high-risk main push requires '${trailerKey}: @github-handle' trailer`
    });
  } else if (!isValidGithubHandle(pairedWith)) {
    reasons.push({
      code: "PAIRING_TRAILER_INVALID",
      message: `trailer '${trailerKey}' must contain a valid GitHub handle; found '${pairedWith}'`
    });
  }

  await writeJsonFile(resultPath, {
    ...basePayload,
    pass: reasons.length === 0,
    status: reasons.length === 0 ? "pass" : "fail",
    pairedWith: pairedWith || null,
    reasonCodes: reasons.map((reason) => reason.code),
    reasonDetails: reasons
  });

  await appendGithubOutput({
    pairing_required: "true",
    pairing_status: reasons.length === 0 ? "pass" : "fail",
    paired_with: pairedWith || "",
    trailer_key: trailerKey,
    high_risk_scopes: JSON.stringify(highRiskScopes),
    pairing_evidence_path: resultPath
  });

  if (reasons.length > 0) {
    for (const reason of reasons) {
      console.error(`[${reason.code}] ${reason.message}`);
    }
    process.exit(1);
  }
}

void main();
