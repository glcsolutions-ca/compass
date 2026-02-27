import { requireEnv, run } from "./utils.mjs";
import { withCcsGuardrail } from "../../shared/ccs-contract.mjs";

async function main() {
  const headSha = requireEnv("HEAD_SHA");
  const remote = process.env.DEPLOY_GIT_REMOTE?.trim() || "origin";
  const branch = process.env.DEPLOY_GIT_BRANCH?.trim() || "main";

  await run("git", ["fetch", "--no-tags", "--prune", "--depth=1", remote, branch]);
  const { stdout: currentMainHead } = await run("git", ["rev-parse", `${remote}/${branch}`]);

  if (headSha !== currentMainHead) {
    throw new Error(
      `Refusing stale deploy release candidate ${headSha}; current ${remote}/${branch} is ${currentMainHead}`
    );
  }

  console.info(`Deploy release candidate is current ${remote}/${branch} head: ${headSha}`);
  return { status: "pass", code: "FRESH_HEAD_PASS" };
}

void withCcsGuardrail({
  guardrailId: "deployment.release-candidate-fresh",
  command: "node scripts/pipeline/cloud/deployment-stage/assert-fresh-release-candidate.mjs",
  passCode: "FRESH_HEAD_PASS",
  passRef: "docs/ccs.md#output-format",
  run: main,
  mapError: (error) => ({
    code: "FRESH_HEAD_FAIL",
    why: error instanceof Error ? error.message : String(error),
    fix: "Deploy only the current main head release candidate.",
    doCommands: ["node scripts/pipeline/cloud/deployment-stage/assert-fresh-release-candidate.mjs"],
    ref: "docs/ccs.md#output-format"
  })
});
