import { describe, expect, it } from "vitest";
import { assertTestingPolicyShape, loadTestPolicyObject } from "./test-policy.mjs";

function createValidPolicy() {
  const dbModules = [
    "pg",
    "@prisma/client",
    "mysql2",
    "mongodb",
    "redis",
    "ioredis",
    "better-sqlite3"
  ];

  return {
    schemaVersion: "2",
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
      dbModules
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
    },
    runtime: {
      modes: {
        commitStage: {
          allowLoopbackOnly: true,
          allowPostgres: false,
          blockChildProcess: true,
          blockedPorts: [5432]
        },
        integration: {
          allowLoopbackOnly: true,
          allowPostgres: true,
          blockChildProcess: false,
          blockedPorts: []
        }
      }
    },
    lint: {
      commitStageGlobs: [
        "apps/*/src/**/*.test.ts",
        "apps/*/src/**/*.test.tsx",
        "packages/*/src/**/*.test.ts",
        "packages/*/src/**/*.test.tsx"
      ],
      focusedTests: true,
      disallowMathRandom: true,
      disallowRawSetTimeout: true,
      disallowDbImports: true,
      disallowChildProcessImports: true,
      dbModules
    }
  };
}

describe("loadTestPolicyObject", () => {
  it("accepts a valid v2 policy", () => {
    const policy = createValidPolicy();
    expect(() => loadTestPolicyObject(policy)).not.toThrow();
  });
});

describe("assertTestingPolicyShape", () => {
  it.each([
    "schemaVersion",
    "scanRoots",
    "layers",
    "imports",
    "paths",
    "docs",
    "rules",
    "runtime",
    "lint"
  ])("fails when required top-level key is missing: %s", (missingKey) => {
    const policy = createValidPolicy();
    delete policy[missingKey];
    expect(() => assertTestingPolicyShape(policy)).toThrow(
      `test policy missing required field: ${missingKey}`
    );
  });

  it("fails when runtime mode field type is invalid", () => {
    const policy = createValidPolicy();
    policy.runtime.modes.commitStage.allowPostgres = "false";
    expect(() => assertTestingPolicyShape(policy)).toThrow(
      "test policy runtime.modes.commitStage.allowPostgres must be a boolean"
    );
  });

  it("fails when lint field type is invalid", () => {
    const policy = createValidPolicy();
    policy.lint.disallowMathRandom = "yes";
    expect(() => assertTestingPolicyShape(policy)).toThrow(
      "test policy lint.disallowMathRandom must be a boolean"
    );
  });

  it("fails when schema version is not v2", () => {
    const policy = createValidPolicy();
    policy.schemaVersion = "1";
    expect(() => assertTestingPolicyShape(policy)).toThrow('test policy schemaVersion must be "2"');
  });
});
