import path from "node:path";
import {
  appendGithubOutput,
  fileExists,
  readJsonFile,
  requireEnv,
  writeJsonFile
} from "./utils.mjs";

function parseRequiredChecks() {
  const raw = requireEnv("REQUIRED_CHECKS_JSON");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("REQUIRED_CHECKS_JSON must be an array");
  }
  return parsed;
}

function collectCheckResults() {
  return {
    preflight: process.env.CHECK_PREFLIGHT_RESULT ?? "unknown",
    "docs-drift": process.env.CHECK_DOCS_DRIFT_RESULT ?? "unknown",
    "codex-review": process.env.CHECK_CODEX_REVIEW_RESULT ?? "unknown",
    "ci-pipeline": process.env.CHECK_CI_PIPELINE_RESULT ?? "unknown",
    "browser-evidence": process.env.CHECK_BROWSER_EVIDENCE_RESULT ?? "unknown",
    "harness-smoke": process.env.CHECK_HARNESS_SMOKE_RESULT ?? "unknown"
  };
}

async function validateArtifact(pathValue, name) {
  if (!pathValue || pathValue.trim().length === 0) {
    throw new Error(`${name} artifact path is missing`);
  }

  const exists = await fileExists(pathValue);
  if (!exists) {
    throw new Error(`${name} artifact is missing at ${pathValue}`);
  }
}

async function main() {
  const headSha = requireEnv("HEAD_SHA");
  const tier = requireEnv("RISK_TIER");
  const requiredChecks = parseRequiredChecks();
  const requiredFlowIds = (process.env.REQUIRED_FLOW_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const checkResults = collectCheckResults();
  const reasons = [];

  for (const alwaysRequired of ["preflight", "docs-drift", "codex-review"]) {
    if (checkResults[alwaysRequired] !== "success") {
      reasons.push(`${alwaysRequired} result is ${checkResults[alwaysRequired]}`);
    }
  }

  const checkToJobResult = {
    "ci-pipeline": checkResults["ci-pipeline"],
    "browser-evidence": checkResults["browser-evidence"],
    "harness-smoke": checkResults["harness-smoke"],
    "codex-review": checkResults["codex-review"]
  };

  for (const checkName of requiredChecks) {
    if (checkName === "risk-policy-gate") {
      continue;
    }

    const result = checkToJobResult[checkName];
    if (!result) {
      reasons.push(`No job result mapping found for required check ${checkName}`);
      continue;
    }

    if (result !== "success") {
      reasons.push(`Required check ${checkName} did not succeed (result=${result})`);
    }
  }

  const preflightPath = requireEnv("PREFLIGHT_PATH");
  const docsDriftPath = requireEnv("DOCS_DRIFT_PATH");
  const reviewPath = requireEnv("REVIEW_PATH");
  const ciPipelinePath = requireEnv("CI_PIPELINE_PATH");

  for (const [name, pathValue] of [
    ["preflight", preflightPath],
    ["docs-drift", docsDriftPath],
    ["codex-review", reviewPath],
    ["ci-pipeline", ciPipelinePath]
  ]) {
    try {
      await validateArtifact(pathValue, name);
    } catch (error) {
      reasons.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (await fileExists(preflightPath)) {
    const preflight = await readJsonFile(preflightPath);
    if (preflight.headSha !== headSha) {
      reasons.push(`Preflight headSha mismatch: expected ${headSha}, got ${preflight.headSha}`);
    }
    if (preflight.tier !== tier) {
      reasons.push(`Preflight tier mismatch: expected ${tier}, got ${preflight.tier}`);
    }
  }

  if (await fileExists(docsDriftPath)) {
    const docsDrift = await readJsonFile(docsDriftPath);
    if (docsDrift.headSha !== headSha) {
      reasons.push(`Docs-drift headSha mismatch: expected ${headSha}, got ${docsDrift.headSha}`);
    }
    if (docsDrift.tier !== tier) {
      reasons.push(`Docs-drift tier mismatch: expected ${tier}, got ${docsDrift.tier}`);
    }
    if (docsDrift.status !== "pass") {
      reasons.push("Docs-drift status is not pass");
    }
  }

  if (await fileExists(reviewPath)) {
    const review = await readJsonFile(reviewPath);
    const codexReviewRequired = requiredChecks.includes("codex-review");
    if (review.headSha !== headSha) {
      reasons.push(`codex-review headSha mismatch: expected ${headSha}, got ${review.headSha}`);
    }
    if (review.tier !== tier) {
      reasons.push(`codex-review tier mismatch: expected ${tier}, got ${review.tier}`);
    }
    if (codexReviewRequired) {
      const allowNoOpForBootstrap =
        review.mode === "no-op" &&
        (review.noOpReason === "missing-api-key" || review.noOpReason === "disabled-by-policy");

      if (review.mode !== "full" && !allowNoOpForBootstrap) {
        reasons.push("codex-review mode must be full, or approved bootstrap no-op, when required");
      }
    }
    if (!codexReviewRequired && review.mode !== "no-op") {
      reasons.push("codex-review mode must be no-op when not required by policy");
    }
  }

  if (requiredChecks.includes("ci-pipeline") && (await fileExists(ciPipelinePath))) {
    const ciPipeline = await readJsonFile(ciPipelinePath);
    if (ciPipeline.headSha !== headSha) {
      reasons.push(`ci-pipeline headSha mismatch: expected ${headSha}, got ${ciPipeline.headSha}`);
    }
    if (ciPipeline.tier !== tier) {
      reasons.push(`ci-pipeline tier mismatch: expected ${tier}, got ${ciPipeline.tier}`);
    }
    if (ciPipeline.status !== "pass") {
      reasons.push("ci-pipeline status is not pass");
    }
  }

  const browserManifestPath = process.env.BROWSER_EVIDENCE_MANIFEST_PATH ?? "";
  if (requiredChecks.includes("browser-evidence")) {
    try {
      await validateArtifact(browserManifestPath, "browser-evidence");

      const browserManifest = await readJsonFile(browserManifestPath);
      if (browserManifest.headSha !== headSha) {
        reasons.push(
          `browser-evidence headSha mismatch: expected ${headSha}, got ${browserManifest.headSha}`
        );
      }
      if (browserManifest.tier !== tier) {
        reasons.push(
          `browser-evidence tier mismatch: expected ${tier}, got ${browserManifest.tier}`
        );
      }

      for (const flowId of requiredFlowIds) {
        const found = Array.isArray(browserManifest.flows)
          ? browserManifest.flows.some((flow) => flow.id === flowId && flow.status === "passed")
          : false;

        if (!found) {
          reasons.push(`browser-evidence missing required passed flow: ${flowId}`);
        }
      }
    } catch (error) {
      reasons.push(error instanceof Error ? error.message : String(error));
    }
  }

  const harnessSmokePath = process.env.HARNESS_SMOKE_PATH ?? "";
  if (requiredChecks.includes("harness-smoke")) {
    try {
      await validateArtifact(harnessSmokePath, "harness-smoke");
      const harnessSmoke = await readJsonFile(harnessSmokePath);
      if (harnessSmoke.headSha !== headSha) {
        reasons.push(
          `harness-smoke headSha mismatch: expected ${headSha}, got ${harnessSmoke.headSha}`
        );
      }
      if (harnessSmoke.tier !== tier) {
        reasons.push(`harness-smoke tier mismatch: expected ${tier}, got ${harnessSmoke.tier}`);
      }
      if (harnessSmoke.status !== "pass") {
        reasons.push("harness-smoke status is not pass");
      }
    } catch (error) {
      reasons.push(error instanceof Error ? error.message : String(error));
    }
  }

  const gatePath = path.join(".artifacts", "risk-policy-gate", headSha, "result.json");
  const gatePayload = {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    tier,
    requiredChecks,
    checkResults,
    pass: reasons.length === 0,
    reasons
  };

  await writeJsonFile(gatePath, gatePayload);
  await appendGithubOutput({ gate_path: gatePath, gate_pass: String(reasons.length === 0) });

  if (reasons.length > 0) {
    console.error("risk-policy-gate blocking reasons:");
    for (const reason of reasons) {
      console.error(`- ${reason}`);
    }
    process.exit(1);
  }

  console.info(`risk-policy-gate passed for ${headSha}`);
}

void main();
