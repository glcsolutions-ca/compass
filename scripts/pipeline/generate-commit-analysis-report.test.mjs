import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createCommitAnalysisReport } from "./generate-commit-analysis-report.mjs";

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

describe("generate-commit-analysis-report", () => {
  it("returns pass when metrics meet thresholds", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "commit-analysis-pass-"));
    const coveragePath = path.join(root, "apps/api/coverage/coverage-summary.json");
    const jscpdPath = path.join(root, ".artifacts/jscpd/jscpd-report.json");
    const configPath = path.join(root, "pipeline/commit-analysis.config.json");

    await writeJson(coveragePath, {
      total: {
        lines: {
          total: 100,
          covered: 80,
          pct: 80
        }
      }
    });
    await writeJson(jscpdPath, {
      statistics: {
        total: {
          percentage: 1.2
        }
      }
    });
    await writeJson(configPath, {
      schemaVersion: "commit-analysis-config.v1",
      thresholds: {
        coverageLinePercentMin: 65,
        duplicationPercentMax: 3,
        lintWarningsMax: 0,
        typecheckWarningsMax: 0
      },
      coverageSummaryPaths: [coveragePath],
      jscpdReportPath: jscpdPath
    });

    const report = await createCommitAnalysisReport({
      configPath,
      lintWarnings: 0,
      typecheckWarnings: 0
    });

    expect(report.verdict).toBe("pass");
    expect(report.failures).toHaveLength(0);
  });

  it("returns fail when thresholds are breached", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "commit-analysis-fail-"));
    const coveragePath = path.join(root, "apps/api/coverage/coverage-summary.json");
    const jscpdPath = path.join(root, ".artifacts/jscpd/jscpd-report.json");
    const configPath = path.join(root, "pipeline/commit-analysis.config.json");

    await writeJson(coveragePath, {
      total: {
        lines: {
          total: 100,
          covered: 40,
          pct: 40
        }
      }
    });
    await writeJson(jscpdPath, {
      statistics: {
        total: {
          percentage: 8.5
        }
      }
    });
    await writeJson(configPath, {
      schemaVersion: "commit-analysis-config.v1",
      thresholds: {
        coverageLinePercentMin: 65,
        duplicationPercentMax: 3,
        lintWarningsMax: 0,
        typecheckWarningsMax: 0
      },
      coverageSummaryPaths: [coveragePath],
      jscpdReportPath: jscpdPath
    });

    const report = await createCommitAnalysisReport({
      configPath,
      lintWarnings: 1,
      typecheckWarnings: 0
    });

    expect(report.verdict).toBe("fail");
    expect(report.failures.length).toBeGreaterThan(0);
  });
});
