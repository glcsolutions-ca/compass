import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  appendGithubOutput,
  parseJsonEnv,
  parsePossiblyFencedJson,
  requireEnv,
  writeJsonFile
} from "./utils.mjs";

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed (${command} ${args.join(" ")}) with exit code ${code}`));
    });
  });
}

function validateReviewReport(report, expectedHeadSha, expectedTier) {
  if (!report || typeof report !== "object") {
    throw new Error("Review report must be an object");
  }

  if (report.headSha !== expectedHeadSha) {
    throw new Error(
      `Review report headSha mismatch: expected ${expectedHeadSha}, got ${report.headSha}`
    );
  }

  if (report.tier !== expectedTier) {
    throw new Error(`Review report tier mismatch: expected ${expectedTier}, got ${report.tier}`);
  }

  if (report.overall !== "pass" && report.overall !== "fail") {
    throw new Error("Review report overall must be 'pass' or 'fail'");
  }

  if (!Array.isArray(report.findings)) {
    throw new Error("Review report findings must be an array");
  }

  for (const finding of report.findings) {
    if (!finding || typeof finding !== "object") {
      throw new Error("Each finding must be an object");
    }

    if (
      typeof finding.id !== "string" ||
      typeof finding.title !== "string" ||
      typeof finding.body !== "string"
    ) {
      throw new Error("Each finding must include id/title/body strings");
    }

    if (!["low", "medium", "high", "critical"].includes(finding.severity)) {
      throw new Error("Finding severity must be one of low|medium|high|critical");
    }
  }
}

function computeBlockingReasons(report) {
  const reasons = [];

  if (report.overall === "fail") {
    reasons.push("Review overall is fail");
  }

  const actionableCount = report.findings.filter((finding) => {
    if (finding.actionable === true) {
      return true;
    }

    return finding.severity === "high" || finding.severity === "critical";
  }).length;

  if (actionableCount > 0) {
    reasons.push(`Actionable findings present (${actionableCount})`);
  }

  return reasons;
}

async function writeFailureReport(reviewPath, headSha, tier, reason) {
  const payload = {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    mode: "full",
    headSha,
    tier,
    overall: "fail",
    summary: reason,
    findings: [
      {
        id: "CODEX-REVIEW-RUNNER-FAILURE",
        title: "codex-review execution failure",
        severity: "high",
        confidence: 1,
        actionable: true,
        file: "scripts/ci/codex-review.mjs",
        line: null,
        body: reason
      }
    ]
  };

  await writeJsonFile(reviewPath, payload);
}

async function writeNoOpReport(reviewPath, headSha, tier, reason, noOpReason) {
  const payload = {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    mode: "no-op",
    headSha,
    tier,
    overall: "pass",
    summary: reason,
    noOpReason,
    findings: []
  };

  await writeJsonFile(reviewPath, payload);
  await appendGithubOutput({
    review_path: reviewPath,
    review_mode: "no-op",
    review_overall: "pass"
  });
}

async function main() {
  const headSha = requireEnv("HEAD_SHA");
  const tier = requireEnv("RISK_TIER");
  const codexReviewEnabled = (process.env.CODEX_REVIEW_ENABLED?.trim() ?? "true") === "true";
  const baseRef = process.env.BASE_REF?.trim() || "main";
  const model = process.env.CODEX_MODEL?.trim() || "gpt-5-codex";
  const changedFiles = parseJsonEnv("CHANGED_FILES_JSON", []);

  const outputDir = path.join(".artifacts", "review", headSha);
  const reviewPath = path.join(outputDir, "review.json");

  if (!codexReviewEnabled) {
    await writeNoOpReport(
      reviewPath,
      headSha,
      tier,
      `codex-review disabled by policy: tier=${tier}; sha=${headSha}`,
      "disabled-by-policy"
    );
    console.info(`codex-review no-op (disabled by policy) for ${tier}`);
    return;
  }

  if (tier !== "t3") {
    await writeNoOpReport(
      reviewPath,
      headSha,
      tier,
      `Skipped by policy: tier=${tier}; sha=${headSha}`,
      "skipped-by-policy"
    );
    console.info(`codex-review no-op for ${tier}`);
    return;
  }

  const flowSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "headSha", "tier", "overall", "summary", "findings"],
    properties: {
      schemaVersion: { type: "string", const: "1" },
      headSha: { type: "string", minLength: 7 },
      tier: { type: "string", const: "t3" },
      overall: { type: "string", enum: ["pass", "fail"] },
      summary: { type: "string", minLength: 1 },
      findings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title", "severity", "confidence", "actionable", "file", "body"],
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            actionable: { type: "boolean" },
            file: { type: "string" },
            line: { type: ["integer", "null"] },
            body: { type: "string" }
          }
        }
      }
    }
  };

  const schemaPath = path.join(outputDir, "review-schema.json");
  await writeJsonFile(schemaPath, flowSchema);

  const changedFileLines = Array.isArray(changedFiles)
    ? changedFiles.map((filePath) => `- ${filePath}`).join("\n")
    : "- (unknown)";

  const prompt = [
    "You are codex-review for CI merge gating.",
    "Return JSON only and follow the provided schema exactly.",
    `Current head SHA: ${headSha}`,
    `Current risk tier: ${tier}`,
    `Base branch: ${baseRef}`,
    "Changed files:",
    changedFileLines,
    "Rules:",
    "- Report only concrete, actionable issues.",
    "- Set actionable=true when issue should block merge.",
    "- Use severities low|medium|high|critical.",
    "- If no issues, set overall='pass' and findings=[]."
  ].join("\n");

  try {
    if (!process.env.OPENAI_API_KEY) {
      await writeNoOpReport(
        reviewPath,
        headSha,
        tier,
        `codex-review no-op: OPENAI_API_KEY missing; tier=${tier}; sha=${headSha}`,
        "missing-api-key"
      );
      console.info("codex-review no-op (missing OPENAI_API_KEY)");
      return;
    }

    await runCommand("npx", [
      "-y",
      "@openai/codex@0.104.0",
      "exec",
      "--model",
      model,
      "--sandbox",
      "read-only",
      "--output-schema",
      schemaPath,
      "--output-last-message",
      reviewPath,
      prompt
    ]);

    const raw = await readFile(reviewPath, "utf8");
    const report = parsePossiblyFencedJson(raw);
    validateReviewReport(report, headSha, tier);

    const blockingReasons = computeBlockingReasons(report);
    if (blockingReasons.length > 0) {
      await appendGithubOutput({
        review_path: reviewPath,
        review_mode: "full",
        review_overall: "fail"
      });
      console.error(`codex-review blocking: ${blockingReasons.join("; ")}`);
      process.exit(1);
    }

    await appendGithubOutput({
      review_path: reviewPath,
      review_mode: "full",
      review_overall: "pass"
    });
    console.info(`codex-review passed for ${headSha}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeFailureReport(reviewPath, headSha, tier, message);
    await appendGithubOutput({
      review_path: reviewPath,
      review_mode: "full",
      review_overall: "fail"
    });
    throw error;
  }
}

void main();
