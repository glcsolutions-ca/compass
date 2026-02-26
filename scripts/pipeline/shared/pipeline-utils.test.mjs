import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyReleaseCandidateKind,
  evaluateDocsDrift,
  getChangedFiles,
  loadPipelinePolicyObject,
  matchesAnyPattern,
  resolveChangeScope
} from "./pipeline-utils.mjs";

const policy = loadPipelinePolicyObject({
  version: "1",
  scopeRules: {
    runtime: [
      "apps/api/**",
      "apps/web/**",
      "apps/worker/**",
      "packages/**",
      "db/migrations/**",
      "db/scripts/**",
      "apps/api/Dockerfile",
      "apps/web/Dockerfile",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "**/package.json"
    ],
    desktop: [
      "apps/desktop/**",
      ".github/workflows/desktop-deployment-pipeline.yml",
      ".github/workflows/desktop-deployment-pipeline.yml"
    ],
    infra: ["infra/azure/**"],
    identity: ["infra/identity/**"],
    migration: ["db/migrations/**", "db/scripts/**"],
    infraRollout: [
      "infra/azure/main.bicep",
      "infra/azure/modules/containerapp-*.bicep",
      "infra/azure/modules/containerapps-env.bicep",
      "infra/azure/environments/*.bicepparam",
      "infra/azure/environments/**"
    ],
    docsOnly: [
      "docs/**",
      "README.md",
      "CONTRIBUTING.md",
      "AGENTS.md",
      "apps/**/README.md",
      "packages/**/README.md",
      "scripts/**/README.md",
      "tests/**/README.md",
      "infra/**/README.md"
    ]
  },
  commitStage: {
    requiredChecks: [
      "determine-scope",
      "commit-test-suite",
      "desktop-commit-test-suite",
      "commit-stage"
    ],
    slo: {
      targetSeconds: 300,
      mode: "enforce"
    }
  },
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
  },
  integrationGate: {
    requiredChecks: [
      "determine-scope",
      "build-compile",
      "migration-safety",
      "runtime-contract-smoke",
      "minimal-integration-smoke",
      "integration-gate"
    ]
  },
  deploymentStage: {
    requireFreshHeadOnAuto: true
  },
  cloudDeploymentPipeline: {
    requiredChecks: [
      "verify-commit-stage-evidence",
      "verify-integration-gate-evidence",
      "build-release-candidate-api-image",
      "build-release-candidate-web-image",
      "build-release-candidate-worker-image",
      "build-release-candidate-dynamic-sessions-runtime-image",
      "publish-release-candidate",
      "deploy-cloud",
      "production-smoke",
      "release-decision"
    ],
    slo: {
      mode: "observe",
      deployCloudTargetSeconds: 1200,
      productionSmokeTargetSeconds: 600
    }
  },
  desktopDeploymentPipeline: {
    requiredChecks: [
      "desktop-commit-stage",
      "desktop-automated-acceptance-test-gate",
      "desktop-deployment-stage",
      "desktop-release-decision"
    ],
    artifactContracts: {
      releaseCandidateManifestPath: ".artifacts/desktop-release-candidate/<sha>/manifest.json",
      automatedAcceptanceTestGateResultPath:
        ".artifacts/desktop-automated-acceptance-test-gate/<sha>/result.json",
      deploymentResultPath: ".artifacts/desktop-deployment-stage/<sha>/result.json",
      releaseDecisionPath: ".artifacts/desktop-release/<sha>/decision.json"
    },
    slo: {
      mode: "observe",
      automatedAcceptanceTestGateTargetSeconds: 1800,
      deploymentStageTargetSeconds: 1200
    }
  },
  docsDriftRules: {
    blockingPaths: [".github/workflows/**", "scripts/pipeline/**"],
    docsCriticalPaths: ["packages/contracts/**"],
    docTargets: ["docs/commit-stage-policy.md", "docs/branch-protection.md"]
  }
});

describe("scope resolution", () => {
  it("classifies runtime changes", () => {
    const scope = resolveChangeScope(policy, ["apps/api/src/server.ts"]);
    expect(scope.runtime).toBe(true);
    expect(scope.infra).toBe(false);
    expect(scope.identity).toBe(false);
    expect(scope.docsOnly).toBe(false);
    expect(classifyReleaseCandidateKind(scope)).toBe("runtime");
  });

  it("classifies infra-only changes", () => {
    const scope = resolveChangeScope(policy, ["infra/azure/main.bicep"]);
    expect(scope.runtime).toBe(false);
    expect(scope.infra).toBe(true);
    expect(scope.infraRollout).toBe(true);
    expect(classifyReleaseCandidateKind(scope)).toBe("infra");
  });

  it("classifies identity-only changes", () => {
    const scope = resolveChangeScope(policy, ["infra/identity/main.tf"]);
    expect(scope.runtime).toBe(false);
    expect(scope.infra).toBe(false);
    expect(scope.identity).toBe(true);
    expect(classifyReleaseCandidateKind(scope)).toBe("identity");
  });

  it("classifies docs-only changes", () => {
    const scope = resolveChangeScope(policy, ["docs/README.md"]);
    expect(scope.docsOnly).toBe(true);
    expect(classifyReleaseCandidateKind(scope)).toBe("checks");
  });

  it("treats infra README changes as docs-only (not infra mutation scope)", () => {
    const scope = resolveChangeScope(policy, ["infra/azure/README.md"]);
    expect(scope.docsOnly).toBe(true);
    expect(scope.infra).toBe(false);
    expect(scope.identity).toBe(false);
    expect(scope.runtime).toBe(false);
    expect(scope.desktop).toBe(false);
    expect(classifyReleaseCandidateKind(scope)).toBe("checks");
  });

  it("classifies desktop-only changes", () => {
    const scope = resolveChangeScope(policy, ["apps/desktop/src/main.ts"]);
    expect(scope.runtime).toBe(false);
    expect(scope.desktop).toBe(true);
    expect(scope.infra).toBe(false);
    expect(scope.identity).toBe(false);
    expect(scope.docsOnly).toBe(false);
    expect(classifyReleaseCandidateKind(scope)).toBe("desktop");
  });

  it("treats desktop README changes as docs-only (not desktop runtime scope)", () => {
    const scope = resolveChangeScope(policy, ["apps/desktop/README.md"]);
    expect(scope.docsOnly).toBe(true);
    expect(scope.desktop).toBe(false);
    expect(scope.runtime).toBe(false);
    expect(scope.infra).toBe(false);
    expect(scope.identity).toBe(false);
    expect(classifyReleaseCandidateKind(scope)).toBe("checks");
  });

  it("flags migration changes", () => {
    const scope = resolveChangeScope(policy, ["db/migrations/202602230001_add_table.sql"]);
    expect(scope.runtime).toBe(true);
    expect(scope.migration).toBe(true);
  });
});

describe("docs drift", () => {
  it("records advisory reason codes for deployment pipeline config changes outside docs-critical paths", () => {
    const result = evaluateDocsDrift(policy, [".github/workflows/commit-stage.yml"]);
    expect(result.shouldBlock).toBe(false);
    expect(result.reasonCodes).toEqual(["DOCS_DRIFT_ADVISORY_DOC_TARGET_MISSING"]);
    expect(result.blockingPathsChanged).toEqual([".github/workflows/commit-stage.yml"]);
  });

  it("blocks docs-critical changes without docs updates", () => {
    const result = evaluateDocsDrift(policy, ["packages/contracts/openapi/schema.ts"]);
    expect(result.shouldBlock).toBe(true);
    expect(result.reasonCodes).toEqual(["DOCS_DRIFT_BLOCKING_DOC_TARGET_MISSING"]);
    expect(result.docsCriticalPathsChanged).toEqual(["packages/contracts/openapi/schema.ts"]);
    expect(result.expectedDocTargets).toEqual([
      "docs/commit-stage-policy.md",
      "docs/branch-protection.md"
    ]);
  });

  it("passes when docs target is updated", () => {
    const result = evaluateDocsDrift(policy, [
      ".github/workflows/commit-stage.yml",
      "docs/commit-stage-policy.md"
    ]);

    expect(result.shouldBlock).toBe(false);
    expect(result.reasonCodes).toEqual([]);
    expect(result.touchedDocTargets).toEqual(["docs/commit-stage-policy.md"]);
  });
});

describe("glob matching engine", () => {
  it("matches deployment pipeline config patterns for dot-prefixed directories", () => {
    expect(matchesAnyPattern(".github/workflows/commit-stage.yml", [".github/workflows/**"])).toBe(
      true
    );
  });

  it("keeps dot-path behavior deterministic for '**' patterns", () => {
    expect(matchesAnyPattern(".github/policy/pipeline-policy.json", ["**"])).toBe(false);
    expect(matchesAnyPattern("README.md", ["**"])).toBe(true);
  });
});

describe("getChangedFiles", () => {
  function runGit(repoDir, args, options = {}) {
    const gitEnv = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))
    );

    return execFileSync("git", args, {
      cwd: repoDir,
      env: gitEnv,
      ...options
    });
  }

  function initRepo() {
    const repoDir = mkdtempSync(path.join(os.tmpdir(), "pipeline-scope-"));
    runGit(repoDir, ["init"]);
    runGit(repoDir, ["config", "user.name", "Compass Test"]);
    runGit(repoDir, ["config", "user.email", "compass-test@example.com"]);
    return repoDir;
  }

  it("returns changed files using symmetric diff when base exists", async () => {
    const repoDir = initRepo();
    const previousCwd = process.cwd();

    try {
      writeFileSync(path.join(repoDir, "a.txt"), "one\n", "utf8");
      runGit(repoDir, ["add", "a.txt"]);
      runGit(repoDir, ["commit", "-m", "first"]);

      writeFileSync(path.join(repoDir, "b.txt"), "two\n", "utf8");
      runGit(repoDir, ["add", "b.txt"]);
      runGit(repoDir, ["commit", "-m", "second"]);

      const baseSha = runGit(repoDir, ["rev-parse", "HEAD^"], {
        encoding: "utf8"
      }).trim();
      const headSha = runGit(repoDir, ["rev-parse", "HEAD"], {
        encoding: "utf8"
      }).trim();

      process.chdir(repoDir);
      await expect(getChangedFiles(baseSha, headSha)).resolves.toEqual(["b.txt"]);
    } finally {
      process.chdir(previousCwd);
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("falls back to head commit files when symmetric diff base is missing", async () => {
    const repoDir = initRepo();
    const previousCwd = process.cwd();

    try {
      writeFileSync(path.join(repoDir, "a.txt"), "one\n", "utf8");
      runGit(repoDir, ["add", "a.txt"]);
      runGit(repoDir, ["commit", "-m", "first"]);

      writeFileSync(path.join(repoDir, "b.txt"), "two\n", "utf8");
      runGit(repoDir, ["add", "b.txt"]);
      runGit(repoDir, ["commit", "-m", "second"]);

      const headSha = runGit(repoDir, ["rev-parse", "HEAD"], {
        encoding: "utf8"
      }).trim();

      process.chdir(repoDir);
      await expect(
        getChangedFiles("0000000000000000000000000000000000000000", headSha)
      ).resolves.toEqual(["b.txt"]);
    } finally {
      process.chdir(previousCwd);
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("ignores inherited git context env variables", async () => {
    const repoDir = initRepo();
    const previousCwd = process.cwd();
    const envKeys = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"];
    const previousEnv = new Map(envKeys.map((key) => [key, process.env[key]]));

    try {
      writeFileSync(path.join(repoDir, "a.txt"), "one\n", "utf8");
      runGit(repoDir, ["add", "a.txt"]);
      runGit(repoDir, ["commit", "-m", "first"]);

      writeFileSync(path.join(repoDir, "b.txt"), "two\n", "utf8");
      runGit(repoDir, ["add", "b.txt"]);
      runGit(repoDir, ["commit", "-m", "second"]);

      const baseSha = runGit(repoDir, ["rev-parse", "HEAD^"], {
        encoding: "utf8"
      }).trim();
      const headSha = runGit(repoDir, ["rev-parse", "HEAD"], {
        encoding: "utf8"
      }).trim();

      process.env.GIT_DIR = "/tmp/not-a-repo";
      process.env.GIT_WORK_TREE = "/tmp/not-a-work-tree";
      process.env.GIT_INDEX_FILE = "/tmp/not-an-index";

      process.chdir(repoDir);
      await expect(getChangedFiles(baseSha, headSha)).resolves.toEqual(["b.txt"]);
    } finally {
      for (const [key, value] of previousEnv) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      process.chdir(previousCwd);
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

describe("high risk mainline policy schema", () => {
  it("requires categories and code owners in policy shape", () => {
    expect(() =>
      loadPipelinePolicyObject({
        ...policy,
        highRiskMainlinePolicy: {
          ...policy.highRiskMainlinePolicy,
          categories: []
        }
      })
    ).toThrowError("highRiskMainlinePolicy.categories must be a non-empty array");

    expect(() =>
      loadPipelinePolicyObject({
        ...policy,
        highRiskMainlinePolicy: {
          ...policy.highRiskMainlinePolicy,
          codeOwners: ["jrkropp"]
        }
      })
    ).toThrowError("highRiskMainlinePolicy.codeOwners entries must be GitHub handles");
  });
});
