import path from "node:path";
import { access } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseCliArgs, optionalOption } from "../../../shared/scripts/cli-utils.mjs";
import { readJsonFile, writeJsonFile } from "../../../shared/scripts/pipeline-contract-lib.mjs";

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function asNumber(value, defaultValue = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : defaultValue;
}

function readDuplicationPercent(report) {
  const candidates = [
    report?.statistics?.total?.percentage,
    report?.statistics?.total?.percent,
    report?.statistics?.formats?.total?.percentage,
    report?.duplicates?.percentage
  ];

  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return 0;
}

async function collectCoverageTotals(coverageSummaryPaths) {
  const totals = {
    linesTotal: 0,
    linesCovered: 0,
    usedReports: []
  };

  for (const summaryPath of coverageSummaryPaths) {
    if (!(await fileExists(summaryPath))) {
      continue;
    }

    const summary = await readJsonFile(summaryPath);
    const linesTotal = asNumber(summary?.total?.lines?.total);
    const linesCovered = asNumber(summary?.total?.lines?.covered);

    totals.linesTotal += linesTotal;
    totals.linesCovered += linesCovered;
    totals.usedReports.push(summaryPath);
  }

  return totals;
}

function evaluateVerdict({ thresholds, metrics }) {
  const failures = [];

  if (metrics.coverageLinePercent < thresholds.coverageLinePercentMin) {
    failures.push(
      `coverageLinePercent ${metrics.coverageLinePercent.toFixed(2)} < ${thresholds.coverageLinePercentMin}`
    );
  }

  if (metrics.duplicationPercent > thresholds.duplicationPercentMax) {
    failures.push(
      `duplicationPercent ${metrics.duplicationPercent.toFixed(2)} > ${thresholds.duplicationPercentMax}`
    );
  }

  if (metrics.lintWarnings > thresholds.lintWarningsMax) {
    failures.push(`lintWarnings ${metrics.lintWarnings} > ${thresholds.lintWarningsMax}`);
  }

  if (metrics.typecheckWarnings > thresholds.typecheckWarningsMax) {
    failures.push(
      `typecheckWarnings ${metrics.typecheckWarnings} > ${thresholds.typecheckWarningsMax}`
    );
  }

  return {
    verdict: failures.length === 0 ? "pass" : "fail",
    failures
  };
}

export async function createCommitAnalysisReport({ configPath, lintWarnings, typecheckWarnings }) {
  const config = await readJsonFile(configPath);
  const thresholds = config.thresholds;

  if (!Array.isArray(config.coverageSummaryPaths) || config.coverageSummaryPaths.length === 0) {
    throw new Error("commit-analysis config must define coverageSummaryPaths");
  }

  const coverageTotals = await collectCoverageTotals(config.coverageSummaryPaths);
  if (coverageTotals.linesTotal === 0) {
    throw new Error("No coverage totals were found. Ensure coverage summaries were generated.");
  }

  const coverageLinePercent = (coverageTotals.linesCovered / coverageTotals.linesTotal) * 100;

  const jscpdReportPath = String(config.jscpdReportPath || "").trim();
  if (!jscpdReportPath) {
    throw new Error("commit-analysis config must define jscpdReportPath");
  }

  if (!(await fileExists(jscpdReportPath))) {
    throw new Error(`JSCPD report not found at ${path.resolve(jscpdReportPath)}`);
  }

  const jscpdReport = await readJsonFile(jscpdReportPath);
  const duplicationPercent = readDuplicationPercent(jscpdReport);

  const metrics = {
    coverageLinePercent,
    duplicationPercent,
    lintWarnings: asNumber(lintWarnings),
    typecheckWarnings: asNumber(typecheckWarnings)
  };
  const { verdict, failures } = evaluateVerdict({
    thresholds,
    metrics
  });

  return {
    schemaVersion: "commit-analysis.v1",
    generatedAt: new Date().toISOString(),
    configPath,
    thresholds,
    metrics,
    inputs: {
      coverageSummaryPaths: coverageTotals.usedReports,
      jscpdReportPath
    },
    verdict,
    failures
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const configPath =
    optionalOption(options, "config") ??
    path.resolve("stages/01-commit/policies/commit-analysis.config.json");
  const outputPath =
    optionalOption(options, "out") ?? ".artifacts/commit-analysis/commit-analysis.json";
  const lintWarnings = optionalOption(options, "lint-warnings") ?? "0";
  const typecheckWarnings = optionalOption(options, "typecheck-warnings") ?? "0";

  const report = await createCommitAnalysisReport({
    configPath,
    lintWarnings,
    typecheckWarnings
  });

  await writeJsonFile(outputPath, report);
  console.info(`Wrote commit analysis report: ${path.resolve(outputPath)}`);

  if (report.verdict === "fail") {
    for (const failure of report.failures) {
      console.error(`- ${failure}`);
    }
    throw new Error("Commit analysis thresholds were not met.");
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
