import { execFile } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createCcsError, withCcsGuardrail } from "../shared/ccs-contract.mjs";
import { loadPipelinePolicy, matchesAnyPattern } from "../shared/pipeline-utils.mjs";

const execFileAsync = promisify(execFile);

export const DEFAULT_PIPELINE_POLICY_PATH = path.join(".github", "policy", "pipeline-policy.json");

export function normalizePath(filePath) {
  return String(filePath || "").replaceAll("\\", "/");
}

async function execGit(args) {
  const { stdout } = await execFileAsync("git", args, { encoding: "utf8" });
  return stdout.trim();
}

export async function resolveCurrentBranch({ env = process.env, execGitFn = execGit } = {}) {
  const explicitBranch = String(env.GITHUB_REF_NAME || "").trim();
  if (explicitBranch.length > 0) {
    return explicitBranch;
  }

  const ref = String(env.GITHUB_REF || "").trim();
  if (ref.startsWith("refs/heads/")) {
    return ref.slice("refs/heads/".length);
  }

  try {
    return await execGitFn(["symbolic-ref", "--quiet", "--short", "HEAD"]);
  } catch {
    return "";
  }
}

export async function listStagedFiles({ execGitFn = execGit } = {}) {
  const stdout = await execGitFn(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
  return stdout
    .split("\n")
    .map((line) => normalizePath(line.trim()))
    .filter((line) => line.length > 0)
    .sort();
}

export function mapHighRiskMatches({ stagedFiles, categories }) {
  return categories
    .map((category) => {
      const matchedFiles = stagedFiles.filter((filePath) =>
        matchesAnyPattern(filePath, category.patterns)
      );

      return {
        id: category.id,
        rationale: category.rationale,
        matchedFiles
      };
    })
    .filter((categoryMatch) => categoryMatch.matchedFiles.length > 0);
}

export function buildHighRiskMainlineFailureMessage({
  ruleId,
  branch,
  matches,
  codeOwners,
  requirePullRequestOnMain
}) {
  const lines = [];
  lines.push(`${ruleId} High-risk mainline commit blocked`);
  lines.push("");
  lines.push("Why this was flagged:");
  lines.push(`- Branch: ${branch || "(unknown)"}`);
  lines.push(`- Matched high-risk categories: ${matches.length}`);

  for (const match of matches) {
    lines.push(`- ${match.id}`);
    lines.push(`  Rationale: ${match.rationale}`);
    lines.push("  Triggered staged files:");
    for (const filePath of match.matchedFiles) {
      lines.push(`  - ${filePath}`);
    }
  }

  lines.push("");
  lines.push("Required next action:");
  if (requirePullRequestOnMain) {
    lines.push("Open a PR reviewed by CODEOWNER before integrating this high-risk change.");
  } else {
    lines.push(
      "Open a PR reviewed by CODEOWNER before integrating this high-risk change (policy recommendation)."
    );
  }
  lines.push("Suggested commands:");
  lines.push("  git switch -c <type>/<scope>-<summary>");
  lines.push('  git commit -m "<type>(<scope>): <summary>"');
  lines.push("  git push -u origin <branch>");
  lines.push("  gh pr create --fill");

  lines.push("");
  lines.push("Write a thoughtful PR (align to .github/pull_request_template.md):");
  lines.push("- Problem and intent: what changed and why it matters.");
  lines.push("- Scope and impacted systems: affected services, infra, or data surfaces.");
  lines.push("- Why this approach: alternatives considered and tradeoffs.");
  lines.push("- Testing evidence: commands executed and key outputs/artifacts.");
  lines.push("- Risk and rollback plan: failure modes, blast radius, and revert steps.");
  lines.push("- Docs/policy updates: what was updated to prevent drift.");

  lines.push("");
  lines.push("Code-owner review:");
  lines.push(`- Request review from ${codeOwners.join(", ")}.`);

  return lines.join("\n");
}

export async function runHighRiskMainlinePolicyCheck({
  policyPath = DEFAULT_PIPELINE_POLICY_PATH,
  policy,
  env = process.env,
  resolveCurrentBranchFn = resolveCurrentBranch,
  listStagedFilesFn = listStagedFiles
} = {}) {
  const loadedPolicy = policy ?? (await loadPipelinePolicy(policyPath));
  const highRiskPolicy = loadedPolicy.highRiskMainlinePolicy;
  const branch = await resolveCurrentBranchFn({ env });
  const stagedFiles = await listStagedFilesFn();

  if (branch !== highRiskPolicy.mainBranch) {
    return {
      status: "pass",
      reasonCode: "NOT_MAIN_BRANCH",
      branch,
      stagedFiles,
      matches: []
    };
  }

  if (stagedFiles.length === 0) {
    return {
      status: "pass",
      reasonCode: "NO_STAGED_FILES",
      branch,
      stagedFiles,
      matches: []
    };
  }

  const matches = mapHighRiskMatches({
    stagedFiles,
    categories: highRiskPolicy.categories
  });

  if (matches.length === 0) {
    return {
      status: "pass",
      reasonCode: "NO_HIGH_RISK_MATCHES",
      branch,
      stagedFiles,
      matches
    };
  }

  return {
    status: "fail",
    reasonCode: "HIGH_RISK_MAINLINE_PR_REQUIRED",
    branch,
    stagedFiles,
    matches,
    message: buildHighRiskMainlineFailureMessage({
      ruleId: highRiskPolicy.ruleId,
      branch,
      matches,
      codeOwners: highRiskPolicy.codeOwners,
      requirePullRequestOnMain: highRiskPolicy.requirePullRequestOnMain
    })
  };
}

export async function main() {
  await withCcsGuardrail({
    guardrailId: "high-risk.mainline-policy",
    command: "pnpm ci:high-risk-mainline-policy",
    passRef: "tests/policy/README.md#troubleshooting",
    run: async () => {
      const result = await runHighRiskMainlinePolicyCheck();

      if (result.status === "fail") {
        console.error(result.message);
        throw createCcsError({
          code: result.reasonCode,
          why: `High-risk staged files were detected on ${result.branch || "main"}.`,
          fix: "Route this change through a PR with CODEOWNER review.",
          doCommands: [
            "git switch -c <type>/<scope>-<summary>",
            'git commit -m "<type>(<scope>): <summary>"',
            "git push -u origin <branch>",
            "gh pr create --fill"
          ],
          ref: "tests/policy/README.md#troubleshooting"
        });
      }

      return { status: "pass", code: result.reasonCode };
    },
    mapError: (error) => ({
      code: "CCS_UNEXPECTED_ERROR",
      why: error instanceof Error ? error.message : String(error),
      fix: "Resolve high-risk policy runtime errors and rerun the guardrail.",
      doCommands: ["pnpm ci:high-risk-mainline-policy"],
      ref: "docs/ccs.md#output-format"
    })
  });
}

const isDirectExecution =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  void main();
}
