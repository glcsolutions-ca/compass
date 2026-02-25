import { describe, expect, it } from "vitest";
import {
  assertRuntimeCoveragePolicyShape,
  evaluateRuntimeCoverage
} from "./runtime-coverage-lib.mjs";

const runtimeCoveragePolicy = {
  schemaVersion: "1",
  mode: "observe",
  minimumStableRunsBeforeEnforce: 3,
  packages: {
    "@compass/api": {
      summaryPath: "apps/api/coverage/coverage-summary.json",
      thresholds: {
        statements: 65,
        branches: 80,
        functions: 35,
        lines: 65
      }
    },
    "@compass/web": {
      summaryPath: "apps/web/coverage/coverage-summary.json",
      thresholds: {
        statements: 50,
        branches: 60,
        functions: 25,
        lines: 50
      }
    }
  }
};

describe("assertRuntimeCoveragePolicyShape", () => {
  it("accepts a valid runtime coverage policy", () => {
    expect(() => assertRuntimeCoveragePolicyShape(runtimeCoveragePolicy)).not.toThrow();
  });

  it("rejects unsupported policy modes", () => {
    const invalidPolicy = {
      ...runtimeCoveragePolicy,
      mode: "disabled"
    };

    expect(() => assertRuntimeCoveragePolicyShape(invalidPolicy)).toThrow(
      "Runtime coverage policy mode must be either 'observe' or 'enforce'"
    );
  });
});

describe("evaluateRuntimeCoverage", () => {
  it("marks a package as pass when all thresholds are met", () => {
    const result = evaluateRuntimeCoverage({
      policy: runtimeCoveragePolicy,
      summariesByPackage: {
        "@compass/api": {
          total: {
            statements: { pct: 72.8 },
            branches: { pct: 83.1 },
            functions: { pct: 44.2 },
            lines: { pct: 72.8 }
          }
        },
        "@compass/web": {
          total: {
            statements: { pct: 54.4 },
            branches: { pct: 61.3 },
            functions: { pct: 29.9 },
            lines: { pct: 54.4 }
          }
        }
      }
    });

    expect(result.allThresholdsMet).toBe(true);
    expect(result.packageResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packageName: "@compass/api",
          status: "pass",
          thresholdsMet: true
        }),
        expect.objectContaining({
          packageName: "@compass/web",
          status: "pass",
          thresholdsMet: true
        })
      ])
    );
  });

  it("reports failures and missing coverage summaries", () => {
    const result = evaluateRuntimeCoverage({
      policy: runtimeCoveragePolicy,
      summariesByPackage: {
        "@compass/api": {
          total: {
            statements: { pct: 64.9 },
            branches: { pct: 83.1 },
            functions: { pct: 44.2 },
            lines: { pct: 72.8 }
          }
        }
      }
    });

    expect(result.allThresholdsMet).toBe(false);
    expect(result.missingSummaries).toEqual([
      {
        packageName: "@compass/web",
        summaryPath: "apps/web/coverage/coverage-summary.json"
      }
    ]);
    expect(result.packageResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packageName: "@compass/api",
          status: "fail",
          thresholdsMet: false
        }),
        expect.objectContaining({
          packageName: "@compass/web",
          status: "missing",
          thresholdsMet: false
        })
      ])
    );
  });
});
