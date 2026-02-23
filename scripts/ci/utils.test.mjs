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
    standard: ["apps/web/**", "apps/api/**", "packages/**", "package.json", "pnpm-lock.yaml"],
    low: ["**"]
  },
  mergePolicy: {
    high: {
      requiredChecks: ["risk-policy-gate", "ci-pipeline", "harness-smoke", "migration-image-smoke"]
    },
    standard: { requiredChecks: ["risk-policy-gate", "ci-pipeline"] },
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

  it("chooses standard for web paths", () => {
    const tier = resolveRiskTier(policy, ["apps/web/src/app/page.tsx"]);
    expect(tier).toBe("standard");
  });

  it("falls back to low for docs-only changes", () => {
    const tier = resolveRiskTier(policy, ["README.md"]);
    expect(tier).toBe("low");
  });

  it("classifies dependency manifest updates as standard changes", () => {
    const tier = resolveRiskTier(policy, ["pnpm-lock.yaml"]);
    expect(tier).toBe("standard");
  });

  it("keeps mixed deps and code updates in standard tier", () => {
    const tier = resolveRiskTier(policy, ["apps/api/src/index.ts", "pnpm-lock.yaml"]);
    expect(tier).toBe("standard");
  });
});

describe("required checks", () => {
  it("adds browser-evidence when UI trigger paths change", () => {
    expect(requiresBrowserEvidence(policy, ["apps/web/src/app/page.tsx"])).toBe(true);

    const checks = computeRequiredChecks(policy, "high", ["apps/web/src/app/page.tsx"]);
    expect(checks).toContain("browser-evidence");
    expect(checks).toContain("harness-smoke");
    expect(checks).not.toContain("migration-image-smoke");
  });

  it("requires migration-image-smoke for high-tier migration paths", () => {
    const checks = computeRequiredChecks(policy, "high", [
      "db/migrations/202602230001_add_table.ts"
    ]);
    expect(checks).toContain("migration-image-smoke");
  });

  it("keeps standard tier checks minimal", () => {
    const checks = computeRequiredChecks(policy, "standard", ["apps/api/src/index.ts"]);
    expect(checks).toEqual(["risk-policy-gate", "ci-pipeline"]);
  });
});

describe("docs drift", () => {
  it("records advisory reason codes for control-plane changes outside docs-critical paths", () => {
    const result = evaluateDocsDrift(policy, [".github/workflows/merge-contract.yml"]);
    expect(result.shouldBlock).toBe(false);
    expect(result.reasonCodes).toEqual(["DOCS_DRIFT_ADVISORY_DOC_TARGET_MISSING"]);
    expect(result.blockingPathsChanged).toEqual([".github/workflows/merge-contract.yml"]);
  });

  it("blocks docs-critical changes without docs updates", () => {
    const result = evaluateDocsDrift(policy, ["packages/contracts/openapi/schema.ts"]);
    expect(result.shouldBlock).toBe(true);
    expect(result.reasonCodes).toEqual(["DOCS_DRIFT_BLOCKING_DOC_TARGET_MISSING"]);
    expect(result.docsCriticalPathsChanged).toEqual(["packages/contracts/openapi/schema.ts"]);
    expect(result.expectedDocTargets).toEqual([
      "docs/merge-policy.md",
      "docs/branch-protection.md"
    ]);
  });

  it("passes when docs target is updated", () => {
    const result = evaluateDocsDrift(policy, [
      ".github/workflows/merge-contract.yml",
      "docs/merge-policy.md"
    ]);

    expect(result.shouldBlock).toBe(false);
    expect(result.reasonCodes).toEqual([]);
    expect(result.touchedDocTargets).toEqual(["docs/merge-policy.md"]);
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
