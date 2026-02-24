import path from "node:path";
import {
  appendGithubOutput,
  fileExists,
  readJsonFile,
  requireEnv,
  writeJsonFile
} from "../../shared/pipeline-utils.mjs";

function parseBoolean(value, fallback = false) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return fallback;
}

async function main() {
  const headSha = requireEnv("HEAD_SHA");
  const deployRequired = parseBoolean(process.env.DEPLOY_REQUIRED, true);
  const deploySkipReasonCode =
    String(process.env.DEPLOY_SKIP_REASON_CODE || "").trim() || "NO_DEPLOY_REQUIRED";
  const decideOutcome = String(process.env.DECIDE_OUTCOME || "unknown").trim();

  const resultPath = path.join(".artifacts", "acceptance", headSha, "result.json");
  let acceptanceDecision = "YES";
  let reasonCodes = [];

  if (deployRequired) {
    if (decideOutcome !== "success") {
      acceptanceDecision = "NO";
    }

    if (await fileExists(resultPath)) {
      const parsed = await readJsonFile(resultPath);
      if (Array.isArray(parsed?.reasonCodes)) {
        reasonCodes = parsed.reasonCodes
          .map((value) => String(value || "").trim())
          .filter((value) => value.length > 0);
      }
    }

    if (acceptanceDecision === "NO" && reasonCodes.length === 0) {
      reasonCodes = ["ACCEPTANCE_GATE_FAILED"];
    }
  } else {
    let reasonMessage = "No deployment required for this release package.";
    if (deploySkipReasonCode === "DOCS_ONLY_CHANGE") {
      reasonMessage = "Docs-only release package; deployment not required.";
    } else if (deploySkipReasonCode === "CHECKS_ONLY_CHANGE") {
      reasonMessage = "Checks-only release package; deployment not required.";
    } else if (deploySkipReasonCode === "DESKTOP_ONLY_CHANGE") {
      reasonMessage = "Desktop-only change; cloud delivery not required.";
    }

    reasonCodes = [deploySkipReasonCode];
    await writeJsonFile(resultPath, {
      schemaVersion: "1",
      generatedAt: new Date().toISOString(),
      headSha,
      pass: true,
      decision: "YES",
      reasonCodes,
      reasons: [reasonMessage]
    });
  }

  await appendGithubOutput({
    acceptance_decision: acceptanceDecision,
    reason_codes_json: JSON.stringify(reasonCodes)
  });
}

void main();
