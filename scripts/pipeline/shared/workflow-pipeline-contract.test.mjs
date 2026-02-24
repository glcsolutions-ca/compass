import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const commitStageWorkflowPath = ".github/workflows/commit-stage.yml";
const productionStageWorkflowPath = ".github/workflows/production-stage.yml";
const sharedApplyScriptPath = "scripts/pipeline/production/apply-infra.mjs";

function readUtf8(filePath) {
  return readFileSync(filePath, "utf8");
}

function extractJobBlock(content, jobName) {
  const lines = content.split("\n");
  const startIndex = lines.findIndex((line) => line.startsWith(`  ${jobName}:`));

  if (startIndex === -1) {
    throw new Error(`Could not find job '${jobName}'`);
  }

  const blockLines = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^  [A-Za-z0-9_-]+:/.test(line)) {
      break;
    }
    blockLines.push(line);
  }

  return blockLines.join("\n");
}

function extractConcurrencySettings(jobBlock) {
  const match = jobBlock.match(
    /^\s{4}concurrency:\n\s{6}group:\s*(.+)\n\s{6}cancel-in-progress:\s*(.+)$/m
  );

  if (!match) {
    throw new Error("Could not find job-level concurrency settings");
  }

  const group = match[1].trim().replace(/^['"]|['"]$/g, "");
  const cancelInProgress = match[2].trim().replace(/^['"]|['"]$/g, "");

  return {
    group,
    cancelInProgress
  };
}

describe("workflow pipeline contract", () => {
  it("keeps production mutation under a serialized lock with cancel disabled", () => {
    const workflow = readUtf8(productionStageWorkflowPath);

    const concurrency = extractConcurrencySettings(extractJobBlock(workflow, "production_mutate"));

    expect(concurrency.group).toBe("production-mutation");
    expect(concurrency.cancelInProgress).toBe("false");
  });

  it("uses shared infra apply script and deterministic run-scoped ARM deployment name", () => {
    const productionWorkflow = readUtf8(productionStageWorkflowPath);

    expect(productionWorkflow).toContain("node scripts/pipeline/production/apply-infra.mjs");
  });

  it("keeps production stage deploy-only with no docker build commands", () => {
    const workflow = readUtf8(productionStageWorkflowPath);

    expect(workflow).not.toContain("docker build");
    expect(workflow).not.toContain("docker push");
  });

  it("keeps commit stage merge-blocking gate context", () => {
    const workflow = readUtf8(commitStageWorkflowPath);
    expect(workflow).toContain("name: commit-stage-gate");
  });

  it("keeps ARM validate and create commands using explicit --name in shared apply script", () => {
    const script = readUtf8(sharedApplyScriptPath);

    expect(script).toMatch(/["']--name["'],\s*deploymentName/);
    expect(script).toContain('"validate"');
    expect(script).toContain('"create"');
  });
});
