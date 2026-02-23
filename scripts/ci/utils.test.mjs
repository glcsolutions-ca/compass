import { describe, expect, it } from "vitest";
import {
  computeRequiredChecks,
  evaluateDocsDrift,
  loadMergePolicyObject,
  matchesAnyPattern,
  resolveRiskTier,
  requiresBrowserEvidence
} from "./utils.mjs";

const policy = loadMergePolicyObject({
  version: "1",
  riskTierRules: {
    high: ["apps/api/src/features/auth/**", ".github/workflows/**", ".github/dependabot.yml"],
    normal: ["apps/web/**", "apps/api/**", "packages/**", "package.json", "pnpm-lock.yaml"],
    low: ["**"]
  },
  mergePolicy: {
    high: {
      requiredChecks: ["risk-policy-gate", "ci-pipeline", "harness-smoke", "codex-review"]
    },
    normal: { requiredChecks: ["risk-policy-gate", "ci-pipeline"] },
    low: { requiredChecks: ["risk-policy-gate", "ci-pipeline"] }
  },
  docsDriftRules: {
    blockingPaths: [".github/workflows/**", "scripts/ci/**"],
    docsCriticalPaths: ["packages/contracts/**"],
    docTargets: ["docs/merge-policy.md", "docs/branch-protection.md"]
  },
  uiEvidenceRules: {
    paths: ["apps/web/**"],
    requiredFlowIds: ["compass-smoke"]
  },
  reviewPolicy: {
    codexReviewEnabled: false
  },
  staleRules: {
    requireHeadShaMatch: true,
    requireTierMatch: true
  }
});

describe("risk tier resolution", () => {
  it("chooses high before lower tiers", () => {
    const tier = resolveRiskTier(policy, ["apps/api/src/features/auth/auth-middleware.ts"]);
    expect(tier).toBe("high");
  });

  it("treats dependabot control-plane config as high", () => {
    const tier = resolveRiskTier(policy, [".github/dependabot.yml"]);
    expect(tier).toBe("high");
  });

  it("chooses normal for web paths", () => {
    const tier = resolveRiskTier(policy, ["apps/web/src/app/page.tsx"]);
    expect(tier).toBe("normal");
  });

  it("falls back to low for docs-only changes", () => {
    const tier = resolveRiskTier(policy, ["README.md"]);
    expect(tier).toBe("low");
  });

  it("classifies dependency manifest updates as normal changes", () => {
    const tier = resolveRiskTier(policy, ["pnpm-lock.yaml"]);
    expect(tier).toBe("normal");
  });

  it("keeps mixed deps and code updates in normal tier", () => {
    const tier = resolveRiskTier(policy, ["apps/api/src/index.ts", "pnpm-lock.yaml"]);
    expect(tier).toBe("normal");
  });
});

describe("required checks", () => {
  it("adds browser-evidence when UI trigger paths change", () => {
    expect(requiresBrowserEvidence(policy, ["apps/web/src/app/page.tsx"])).toBe(true);

    const checks = computeRequiredChecks(policy, "high", ["apps/web/src/app/page.tsx"]);
    expect(checks).toContain("browser-evidence");
    expect(checks).not.toContain("codex-review");
  });

  it("excludes codex-review when policy disables it", () => {
    const checks = computeRequiredChecks(policy, "high", ["scripts/ci/gate.mjs"]);
    expect(checks).not.toContain("codex-review");
  });

  it("includes codex-review when policy enables it", () => {
    const enabledPolicy = loadMergePolicyObject({
      ...policy,
      reviewPolicy: {
        codexReviewEnabled: true
      }
    });

    const checks = computeRequiredChecks(enabledPolicy, "high", ["scripts/ci/gate.mjs"]);
    expect(checks).toContain("codex-review");
  });
});

describe("docs drift", () => {
  it("does not block control-plane changes outside docs-critical paths", () => {
    const result = evaluateDocsDrift(policy, [".github/workflows/merge-contract.yml"]);
    expect(result.shouldBlock).toBe(false);
  });

  it("blocks docs-critical changes without docs updates", () => {
    const result = evaluateDocsDrift(policy, ["packages/contracts/openapi/schema.ts"]);
    expect(result.shouldBlock).toBe(true);
  });

  it("passes when docs target is updated", () => {
    const result = evaluateDocsDrift(policy, [
      ".github/workflows/merge-contract.yml",
      "docs/merge-policy.md"
    ]);

    expect(result.shouldBlock).toBe(false);
  });
});

describe("glob matching engine", () => {
  it("matches control-plane patterns for dot-prefixed directories", () => {
    expect(
      matchesAnyPattern(".github/workflows/merge-contract.yml", [".github/workflows/**"])
    ).toBe(true);
  });

  it("keeps dot-path behavior deterministic for '**' patterns", () => {
    expect(matchesAnyPattern(".github/policy/merge-policy.json", ["**"])).toBe(false);
    expect(matchesAnyPattern("README.md", ["**"])).toBe(true);
  });
});
