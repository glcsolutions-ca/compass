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
    t3: ["apps/api/src/features/auth/**", ".github/workflows/**", ".github/dependabot.yml"],
    t2: ["apps/web/**"],
    t1: ["apps/api/**", "packages/**", "package.json", "pnpm-lock.yaml", "**/package.json"],
    t0: ["**"]
  },
  mergePolicy: {
    t3: { requiredChecks: ["risk-policy-gate", "ci-pipeline", "harness-smoke", "codex-review"] },
    t2: { requiredChecks: ["risk-policy-gate", "ci-pipeline", "browser-evidence"] },
    t1: { requiredChecks: ["risk-policy-gate", "ci-pipeline"] },
    t0: { requiredChecks: ["risk-policy-gate", "ci-pipeline"] }
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
  it("chooses t3 before lower tiers", () => {
    const tier = resolveRiskTier(policy, ["apps/api/src/features/auth/auth-middleware.ts"]);
    expect(tier).toBe("t3");
  });

  it("treats dependabot control-plane config as t3", () => {
    const tier = resolveRiskTier(policy, [".github/dependabot.yml"]);
    expect(tier).toBe("t3");
  });

  it("chooses t2 for web paths", () => {
    const tier = resolveRiskTier(policy, ["apps/web/src/app/page.tsx"]);
    expect(tier).toBe("t2");
  });

  it("falls back to t0 for docs-only changes", () => {
    const tier = resolveRiskTier(policy, ["README.md"]);
    expect(tier).toBe("t0");
  });

  it("classifies dependency manifest updates as t1 core changes", () => {
    const tier = resolveRiskTier(policy, ["pnpm-lock.yaml"]);
    expect(tier).toBe("t1");
  });
});

describe("required checks", () => {
  it("adds browser-evidence when UI trigger paths change", () => {
    expect(requiresBrowserEvidence(policy, ["apps/web/src/app/page.tsx"])).toBe(true);

    const checks = computeRequiredChecks(policy, "t3", ["apps/web/src/app/page.tsx"]);
    expect(checks).toContain("browser-evidence");
    expect(checks).not.toContain("codex-review");
  });
});

describe("docs drift", () => {
  it("blocks control-plane changes without docs updates", () => {
    const result = evaluateDocsDrift(policy, [".github/workflows/merge-contract.yml"]);
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

  it("uses path.posix.matchesGlob semantics for '**' against dot-prefixed paths", () => {
    expect(matchesAnyPattern(".github/policy/merge-policy.json", ["**"])).toBe(false);
    expect(matchesAnyPattern("README.md", ["**"])).toBe(true);
  });
});
