import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const deployWorkflowPath = ".github/workflows/deploy.yml";
const infraApplyWorkflowPath = ".github/workflows/infra-apply.yml";
const sharedApplyScriptPath = "scripts/deploy/apply-bicep-template.mjs";

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

describe("workflow concurrency contract", () => {
  it("keeps deploy and infra-apply on the same production mutation lock with cancel disabled", () => {
    const deployWorkflow = readUtf8(deployWorkflowPath);
    const infraApplyWorkflow = readUtf8(infraApplyWorkflowPath);

    const deployConcurrency = extractConcurrencySettings(
      extractJobBlock(deployWorkflow, "promote")
    );
    const infraConcurrency = extractConcurrencySettings(
      extractJobBlock(infraApplyWorkflow, "bicep_apply")
    );

    expect(deployConcurrency.group).toBe(infraConcurrency.group);
    expect(deployConcurrency.group).toBe("production-mutation");
    expect(deployConcurrency.cancelInProgress).toBe("false");
    expect(infraConcurrency.cancelInProgress).toBe("false");
  });

  it("uses shared apply script and deterministic run-scoped ARM deployment name in both workflows", () => {
    const deployWorkflow = readUtf8(deployWorkflowPath);
    const infraApplyWorkflow = readUtf8(infraApplyWorkflowPath);

    expect(deployWorkflow).toContain("node scripts/deploy/apply-bicep-template.mjs");
    expect(infraApplyWorkflow).toContain("node scripts/deploy/apply-bicep-template.mjs");

    expect(deployWorkflow).toContain(
      "ARM_DEPLOYMENT_NAME: main-${{ github.run_id }}-${{ github.run_attempt }}"
    );
    expect(infraApplyWorkflow).toContain(
      "ARM_DEPLOYMENT_NAME: main-${{ github.run_id }}-${{ github.run_attempt }}"
    );
  });

  it("keeps ARM validate and create commands using explicit --name in shared apply script", () => {
    const script = readUtf8(sharedApplyScriptPath);

    expect(script).toMatch(/["']--name["'],\s*deploymentName/);
    expect(script).toContain('"validate"');
    expect(script).toContain('"create"');
  });
});
