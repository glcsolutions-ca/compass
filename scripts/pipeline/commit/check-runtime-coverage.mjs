import path from "node:path";
import { withCcsGuardrail } from "../shared/ccs-contract.mjs";
import {
  appendGithubStepSummary,
  fileExists,
  getCurrentSha,
  readJsonFile,
  writeJsonFile
} from "../shared/pipeline-utils.mjs";
import {
  COVERAGE_METRICS,
  assertRuntimeCoveragePolicyShape,
  evaluateRuntimeCoverage
} from "./runtime-coverage-lib.mjs";

const DEFAULT_POLICY_PATH = path.join("tests", "policy", "runtime-coverage-policy.json");

function formatPercent(value) {
  if (value === null) {
    return "n/a";
  }

  return `${value.toFixed(2)}%`;
}

function formatMetricCell(metric) {
  return `${formatPercent(metric.actual)} / ${formatPercent(metric.threshold)}`;
}

function renderSummaryMarkdown(result, artifactPath) {
  const lines = [];
  lines.push("### Runtime Coverage");
  lines.push("");
  lines.push(`- mode: \`${result.mode}\``);
  lines.push(`- testedSha: \`${result.testedSha}\``);
  lines.push(`- thresholdsMet: \`${result.allThresholdsMet}\``);
  lines.push(`- artifact: \`${artifactPath}\``);
  lines.push("");
  lines.push("| Package | Statements | Branches | Functions | Lines | Status |");
  lines.push("|---|---:|---:|---:|---:|---|");

  for (const packageResult of result.packageResults) {
    lines.push(
      [
        `| ${packageResult.packageName}`,
        formatMetricCell(packageResult.metrics.statements),
        formatMetricCell(packageResult.metrics.branches),
        formatMetricCell(packageResult.metrics.functions),
        formatMetricCell(packageResult.metrics.lines),
        packageResult.status
      ].join(" | ") + " |"
    );
  }

  if (result.missingSummaries.length > 0) {
    lines.push("");
    lines.push("Missing coverage summaries:");
    for (const missing of result.missingSummaries) {
      lines.push(`- ${missing.packageName}: \`${missing.summaryPath}\``);
    }
  }

  return lines.join("\n");
}

async function main() {
  const testedSha = process.env.TESTED_SHA?.trim() || (await getCurrentSha());
  const policyPath = process.env.RUNTIME_COVERAGE_POLICY_PATH?.trim() || DEFAULT_POLICY_PATH;
  const policy = await readJsonFile(policyPath);
  assertRuntimeCoveragePolicyShape(policy);

  const summariesByPackage = {};
  for (const [packageName, config] of Object.entries(policy.packages)) {
    const summaryPath = String(config.summaryPath || "");
    const summaryExists = await fileExists(summaryPath);
    if (!summaryExists) {
      continue;
    }

    summariesByPackage[packageName] = await readJsonFile(summaryPath);
  }

  const evaluation = evaluateRuntimeCoverage({
    policy,
    summariesByPackage
  });

  const artifactPath = path.join(".artifacts", "runtime-coverage", testedSha, "result.json");
  const result = {
    schemaVersion: "1",
    testedSha,
    policyPath,
    mode: evaluation.mode,
    minimumStableRunsBeforeEnforce: evaluation.minimumStableRunsBeforeEnforce,
    allThresholdsMet: evaluation.allThresholdsMet,
    missingSummaries: evaluation.missingSummaries,
    packageResults: evaluation.packageResults,
    generatedAt: new Date().toISOString()
  };
  await writeJsonFile(artifactPath, result);

  for (const packageResult of result.packageResults) {
    const metrics = COVERAGE_METRICS.map(
      (metric) => `${metric}=${formatMetricCell(packageResult.metrics[metric])}`
    ).join(", ");
    console.log(
      `[runtime-coverage] ${packageResult.packageName} status=${packageResult.status} ${metrics}`
    );
  }

  await appendGithubStepSummary(renderSummaryMarkdown(result, artifactPath));
  console.log(`[runtime-coverage] Artifact: ${artifactPath}`);

  if (result.missingSummaries.length > 0) {
    throw new Error("Runtime coverage policy check failed: one or more summary files are missing");
  }

  if (result.mode === "enforce" && !result.allThresholdsMet) {
    throw new Error(
      "Runtime coverage policy check failed: one or more packages are below threshold"
    );
  }

  return { status: "pass", code: "RCOV000" };
}

void withCcsGuardrail({
  guardrailId: "runtime.coverage",
  command: "pnpm ci:runtime-coverage",
  passCode: "RCOV000",
  passRef: "tests/policy/README.md#layer-4-runtime-coverage-ratchet-observe-first",
  run: main,
  mapError: (error) => ({
    code: "RCOV001",
    why: error instanceof Error ? error.message : String(error),
    fix: "Resolve runtime coverage summary/threshold failures.",
    doCommands: ["pnpm ci:runtime-coverage"],
    ref: "tests/policy/README.md#layer-4-runtime-coverage-ratchet-observe-first"
  })
});
