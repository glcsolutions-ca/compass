import { describe, expect, it } from "vitest";
import {
  mapHighRiskMatches,
  resolveCurrentBranch,
  runHighRiskMainlinePolicyCheck
} from "./check-high-risk-mainline-policy.mjs";

const highRiskPolicyFixture = {
  highRiskMainlinePolicy: {
    ruleId: "HR001",
    mainBranch: "main",
    requirePullRequestOnMain: true,
    codeOwners: ["@jrkropp"],
    categories: [
      {
        id: "infra-mutation",
        patterns: ["infra/azure/**", "infra/identity/**"],
        rationale: "production infrastructure and identity control-plane mutation risk"
      },
      {
        id: "data-mutation",
        patterns: ["db/migrations/**", "db/scripts/**"],
        rationale: "schema/data integrity and rollout/rollback risk"
      },
      {
        id: "pipeline-governance-mutation",
        patterns: [".github/workflows/**", ".github/policy/**", "scripts/pipeline/**"],
        rationale: "deployment pipeline config and release/deploy decision behavior risk"
      }
    ]
  }
};

describe("resolveCurrentBranch", () => {
  it("prefers GITHUB_REF_NAME when available", async () => {
    const branch = await resolveCurrentBranch({
      env: { GITHUB_REF_NAME: "main", GITHUB_REF: "refs/heads/other" }
    });
    expect(branch).toBe("main");
  });

  it("falls back to parsing GITHUB_REF", async () => {
    const branch = await resolveCurrentBranch({
      env: { GITHUB_REF: "refs/heads/release" }
    });
    expect(branch).toBe("release");
  });
});

describe("mapHighRiskMatches", () => {
  it("maps staged files to matching categories only", () => {
    const matches = mapHighRiskMatches({
      stagedFiles: ["infra/azure/main.bicep", "docs/README.md"],
      categories: highRiskPolicyFixture.highRiskMainlinePolicy.categories
    });

    expect(matches).toEqual([
      {
        id: "infra-mutation",
        rationale: "production infrastructure and identity control-plane mutation risk",
        matchedFiles: ["infra/azure/main.bicep"]
      }
    ]);
  });
});

describe("runHighRiskMainlinePolicyCheck", () => {
  it("blocks high-risk staged files on main and emits rich PR guidance", async () => {
    const result = await runHighRiskMainlinePolicyCheck({
      policy: highRiskPolicyFixture,
      resolveCurrentBranchFn: async () => "main",
      listStagedFilesFn: async () => [
        ".github/workflows/commit-stage.yml",
        "infra/azure/main.bicep"
      ]
    });

    expect(result.status).toBe("fail");
    expect(result.reasonCode).toBe("HIGH_RISK_MAINLINE_PR_REQUIRED");
    expect(result.message).toContain("HR001 High-risk mainline commit blocked");
    expect(result.message).toContain("Branch: main");
    expect(result.message).toContain("infra-mutation");
    expect(result.message).toContain("pipeline-governance-mutation");
    expect(result.message).toContain("Open a PR reviewed by CODEOWNER");
    expect(result.message).toContain("gh pr create --fill");
    expect(result.message).toContain("Problem and intent");
    expect(result.message).toContain("Request review from @jrkropp");
  });

  it("passes on main when staged files are not high risk", async () => {
    const result = await runHighRiskMainlinePolicyCheck({
      policy: highRiskPolicyFixture,
      resolveCurrentBranchFn: async () => "main",
      listStagedFilesFn: async () => ["docs/architecture/overview.md", "README.md"]
    });

    expect(result).toMatchObject({
      status: "pass",
      reasonCode: "NO_HIGH_RISK_MATCHES",
      branch: "main",
      matches: []
    });
  });

  it("does not block high-risk files on non-main branches", async () => {
    const result = await runHighRiskMainlinePolicyCheck({
      policy: highRiskPolicyFixture,
      resolveCurrentBranchFn: async () => "feat/infra-hardening",
      listStagedFilesFn: async () => ["infra/identity/main.bicep"]
    });

    expect(result).toMatchObject({
      status: "pass",
      reasonCode: "NOT_MAIN_BRANCH",
      branch: "feat/infra-hardening",
      matches: []
    });
  });

  it("reports only matched high-risk files when staged set is mixed", async () => {
    const result = await runHighRiskMainlinePolicyCheck({
      policy: highRiskPolicyFixture,
      resolveCurrentBranchFn: async () => "main",
      listStagedFilesFn: async () => ["docs/README.md", "db/migrations/202602250001.sql"]
    });

    expect(result.status).toBe("fail");
    expect(result.matches).toEqual([
      {
        id: "data-mutation",
        rationale: "schema/data integrity and rollout/rollback risk",
        matchedFiles: ["db/migrations/202602250001.sql"]
      }
    ]);
    expect(result.message).toContain("db/migrations/202602250001.sql");
    expect(result.message).not.toContain("docs/README.md");
  });
});
