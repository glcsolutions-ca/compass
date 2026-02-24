import path from "node:path";
import { parseJsonEnv, requireEnv, writeJsonFile } from "./pipeline-utils.mjs";

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || String(value).trim().length === 0) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  throw new Error(`Expected boolean-like value, received '${value}'`);
}

function parseArrayEnv(name) {
  const parsed = parseJsonEnv(name, []);
  if (!Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON array`);
  }
  return parsed.map((value) => String(value));
}

async function main() {
  const headSha = requireEnv("HEAD_SHA");

  const payload = {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    changeClass: process.env.CHANGE_CLASS?.trim() || "checks",
    source: {
      commitRunId: process.env.COMMIT_RUN_ID?.trim() || ""
    },
    scope: {
      runtime: parseBoolean(process.env.RUNTIME_CHANGED),
      infra: parseBoolean(process.env.INFRA_CHANGED),
      identity: parseBoolean(process.env.IDENTITY_CHANGED),
      docsOnly: parseBoolean(process.env.DOCS_ONLY_CHANGED)
    },
    requiresInfraConvergence: parseBoolean(process.env.REQUIRES_INFRA_CONVERGENCE),
    requiresMigrations: parseBoolean(process.env.REQUIRES_MIGRATIONS),
    candidate: {
      apiRef: process.env.CANDIDATE_API_REF?.trim() || "",
      webRef: process.env.CANDIDATE_WEB_REF?.trim() || ""
    },
    eligibility: {
      status: process.env.ELIGIBILITY_STATUS?.trim() || "required",
      reasonCode: process.env.ELIGIBILITY_REASON_CODE?.trim() || ""
    },
    configContracts: {
      candidateRefs: {
        status: process.env.CANDIDATE_REF_CONTRACT_STATUS?.trim() || "unknown",
        reasonCodes: parseArrayEnv("CANDIDATE_REF_CONTRACT_REASON_CODES_JSON")
      },
      identity: {
        status: process.env.IDENTITY_CONFIG_CONTRACT_STATUS?.trim() || "unknown",
        reasonCodes: parseArrayEnv("IDENTITY_CONFIG_CONTRACT_REASON_CODES_JSON")
      }
    },
    candidateFidelity: {
      runtimeCandidateRefsRequired:
        parseBoolean(process.env.RUNTIME_CHANGED) ||
        parseBoolean(process.env.INFRA_CHANGED) ||
        parseBoolean(process.env.REQUIRES_INFRA_CONVERGENCE),
      status: process.env.CANDIDATE_FIDELITY_STATUS?.trim() || "unknown"
    },
    checks: {
      runtimeBlackboxAcceptance: process.env.RUNTIME_RESULT?.trim() || "skipped",
      infraReadonlyAcceptance: process.env.INFRA_RESULT?.trim() || "skipped",
      identityReadonlyAcceptance: process.env.IDENTITY_RESULT?.trim() || "skipped",
      acceptanceStage: process.env.ACCEPTANCE_STAGE_RESULT?.trim() || "unknown"
    }
  };

  const outputPath = path.join(".artifacts", "acceptance", headSha, "evidence-manifest.json");
  await writeJsonFile(outputPath, payload);
  console.info(`Wrote acceptance evidence manifest: ${outputPath}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
