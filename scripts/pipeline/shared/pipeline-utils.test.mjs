import { describe, expect, it } from "vitest";
import {
  classifyReleaseCandidateKind,
  evaluateDocsDrift,
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
      "pairing-evidence-check",
      "commit-stage"
    ],
    slo: {
      targetSeconds: 300,
      mode: "enforce"
    }
  },
  pairingPolicy: {
    highRiskScopes: ["infra", "identity", "migration"],
    trailerKey: "Paired-With"
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
      "auth-critical-smoke",
      "minimal-integration-smoke",
      "integration-gate"
    ]
  },
  automatedAcceptanceTestGate: {
    requiredFlowIds: ["compass-smoke"],
    runtimeRequiredChecks: [
      "runtime-api-system-acceptance",
      "runtime-browser-acceptance",
      "runtime-migration-image-acceptance"
    ],
    infraRequiredChecks: ["infra-readonly-acceptance"],
    identityRequiredChecks: ["identity-readonly-acceptance"]
  },
  deploymentStage: {
    requireFreshHeadOnAuto: true
  },
  cloudDeploymentPipeline: {
    slo: {
      mode: "observe",
      automatedAcceptanceTestGateTargetSeconds: 900,
      deploymentStageTargetSeconds: 1200
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
