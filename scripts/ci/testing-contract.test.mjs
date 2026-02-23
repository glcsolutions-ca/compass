import { describe, expect, it } from "vitest";
import {
  assertTestingPolicyShape,
  ensureNoDeprecatedQuarantinePath,
  validateQuarantineEntry
} from "./testing-contract.mjs";

function createValidPolicy() {
  return {
    schemaVersion: "1",
    scanRoots: ["apps", "packages", "tests"],
    layers: {
      commitStage: [
        "apps/*/src/**/*.test.ts",
        "apps/*/src/**/*.test.tsx",
        "packages/*/src/**/*.test.ts",
        "packages/*/src/**/*.test.tsx"
      ],
      integration: [
        "apps/*/test/integration/**/*.test.ts",
        "apps/*/test/integration/**/*.test.tsx"
      ],
      e2e: ["tests/e2e/**/*.spec.ts", "tests/e2e/**/*.spec.tsx"],
      smoke: ["tests/smoke/**/*.ts", "tests/smoke/**/*.tsx"]
    },
    imports: {
      playwrightModules: ["@playwright/test"],
      dbModules: ["pg", "@prisma/client"]
    },
    paths: {
      quarantine: "tests/policy/test-quarantine.json"
    },
    docs: {
      principles: "tests/README.md#principles",
      directoryConventions: "tests/README.md#directory-conventions",
      flakePolicy: "tests/README.md#flake-policy",
      integrationLayer: "tests/README.md#4-integration-tests-some-high-value"
    },
    rules: {
      TC001: { enabled: true },
      TC010: { enabled: true },
      TC011: { enabled: true },
      TC020: { enabled: true }
    }
  };
}

describe("assertTestingPolicyShape", () => {
  it("accepts a valid policy object", () => {
    expect(() => assertTestingPolicyShape(createValidPolicy())).not.toThrow();
  });

  it.each(["schemaVersion", "scanRoots", "layers", "imports", "paths", "docs", "rules"])(
    "fails when required top-level key is missing: %s",
    (missingKey) => {
      const policy = createValidPolicy();
      delete policy[missingKey];

      expect(() => assertTestingPolicyShape(policy)).toThrow();
    }
  );

  it("fails when a required layer glob list is invalid", () => {
    const policy = createValidPolicy();
    policy.layers.commitStage = [];

    expect(() => assertTestingPolicyShape(policy)).toThrow(
      "test policy layers.commitStage must be a non-empty array"
    );
  });

  it("fails when required docs links are missing or invalid", () => {
    const missingDocPolicy = createValidPolicy();
    delete missingDocPolicy.docs.principles;
    expect(() => assertTestingPolicyShape(missingDocPolicy)).toThrow();

    const invalidDocPolicy = createValidPolicy();
    invalidDocPolicy.docs.principles = "tests/policy/README.md#design-goals";
    expect(() => assertTestingPolicyShape(invalidDocPolicy)).toThrow(
      "test policy docs.principles must reference tests/README.md#..."
    );
  });

  it("fails when quarantine path type is invalid", () => {
    const policy = createValidPolicy();
    policy.paths.quarantine = 1;

    expect(() => assertTestingPolicyShape(policy)).toThrow(
      "test policy paths.quarantine must be a non-empty string"
    );
  });

  it("fails when rules object is invalid", () => {
    const missingRulePolicy = createValidPolicy();
    delete missingRulePolicy.rules.TC020;
    expect(() => assertTestingPolicyShape(missingRulePolicy)).toThrow();

    const invalidRulePolicy = createValidPolicy();
    invalidRulePolicy.rules.TC010.enabled = "true";
    expect(() => assertTestingPolicyShape(invalidRulePolicy)).toThrow(
      "test policy rules.TC010.enabled must be a boolean"
    );
  });
});

describe("validateQuarantineEntry", () => {
  it("rejects malformed quarantine entries with field-level errors", () => {
    const missingOwner = validateQuarantineEntry(
      { id: "apps/api/src/app.test.ts:10", reason: "flake", expiresOn: "2026-02-28" },
      0,
      "tests/policy/test-quarantine.json"
    );
    expect(missingOwner).toEqual({
      valid: false,
      error: "tests/policy/test-quarantine.json:entries[0].owner is required"
    });

    const invalidExpiry = validateQuarantineEntry(
      { id: "apps/api/src/app.test.ts:10", owner: "team-api", reason: "flake", expiresOn: "bad" },
      1,
      "tests/policy/test-quarantine.json"
    );
    expect(invalidExpiry).toEqual({
      valid: false,
      error: "tests/policy/test-quarantine.json:entries[1].expiresOn must be YYYY-MM-DD"
    });
  });
});

describe("ensureNoDeprecatedQuarantinePath", () => {
  it("returns a migration violation when legacy quarantine file exists", async () => {
    const violation = await ensureNoDeprecatedQuarantinePath({
      quarantinePath: "tests/policy/test-quarantine.json",
      docsLink: "tests/README.md#flake-policy",
      fileExistsFn: async () => true
    });

    expect(violation?.ruleId).toBe("TC011");
    expect(violation?.title).toBe("Deprecated quarantine path is not allowed");
    expect(violation?.file).toBe("tests/quarantine.json");
    expect(violation?.fix).toEqual([
      "Move entries from tests/quarantine.json to tests/policy/test-quarantine.json.",
      "Delete tests/quarantine.json after migration."
    ]);
  });

  it("returns null when legacy quarantine path is absent", async () => {
    const violation = await ensureNoDeprecatedQuarantinePath({
      quarantinePath: "tests/policy/test-quarantine.json",
      docsLink: "tests/README.md#flake-policy",
      fileExistsFn: async () => false
    });

    expect(violation).toBeNull();
  });
});
