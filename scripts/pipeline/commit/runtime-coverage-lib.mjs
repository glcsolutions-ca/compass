export const COVERAGE_METRICS = ["statements", "branches", "functions", "lines"];

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPercentage(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function toPercentage(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number(value.toFixed(2));
  }

  return null;
}

export function assertRuntimeCoveragePolicyShape(policy) {
  if (!isObject(policy)) {
    throw new Error("Runtime coverage policy must be an object");
  }

  if (policy.schemaVersion !== "1") {
    throw new Error("Runtime coverage policy schemaVersion must be '1'");
  }

  if (!["observe", "enforce"].includes(String(policy.mode || "").trim())) {
    throw new Error("Runtime coverage policy mode must be either 'observe' or 'enforce'");
  }

  if (
    !Number.isInteger(policy.minimumStableRunsBeforeEnforce) ||
    policy.minimumStableRunsBeforeEnforce <= 0
  ) {
    throw new Error(
      "Runtime coverage policy minimumStableRunsBeforeEnforce must be a positive integer"
    );
  }

  if (!isObject(policy.packages) || Object.keys(policy.packages).length === 0) {
    throw new Error("Runtime coverage policy packages must be a non-empty object");
  }

  for (const [packageName, config] of Object.entries(policy.packages)) {
    if (!isObject(config)) {
      throw new Error(`Runtime coverage policy packages.${packageName} must be an object`);
    }

    if (String(config.summaryPath || "").trim().length === 0) {
      throw new Error(
        `Runtime coverage policy packages.${packageName}.summaryPath must be a non-empty string`
      );
    }

    if (!isObject(config.thresholds)) {
      throw new Error(
        `Runtime coverage policy packages.${packageName}.thresholds must be an object`
      );
    }

    for (const metric of COVERAGE_METRICS) {
      if (!isPercentage(config.thresholds[metric])) {
        throw new Error(
          `Runtime coverage policy packages.${packageName}.thresholds.${metric} must be a percentage between 0 and 100`
        );
      }
    }
  }
}

export function evaluateRuntimeCoverage({ policy, summariesByPackage }) {
  const packageResults = [];
  const missingSummaries = [];
  let allThresholdsMet = true;

  for (const [packageName, config] of Object.entries(policy.packages)) {
    const summary = summariesByPackage[packageName];
    if (!summary) {
      missingSummaries.push({
        packageName,
        summaryPath: config.summaryPath
      });
      allThresholdsMet = false;
      packageResults.push({
        packageName,
        summaryPath: config.summaryPath,
        status: "missing",
        thresholdsMet: false,
        metrics: Object.fromEntries(
          COVERAGE_METRICS.map((metric) => [
            metric,
            { actual: null, threshold: config.thresholds[metric], pass: false }
          ])
        )
      });
      continue;
    }

    const totals = isObject(summary.total) ? summary.total : {};
    const metrics = {};
    let thresholdsMet = true;

    for (const metric of COVERAGE_METRICS) {
      const actual = toPercentage(totals?.[metric]?.pct);
      const threshold = config.thresholds[metric];
      const pass = actual !== null && actual >= threshold;
      metrics[metric] = { actual, threshold, pass };
      if (!pass) {
        thresholdsMet = false;
      }
    }

    if (!thresholdsMet) {
      allThresholdsMet = false;
    }

    packageResults.push({
      packageName,
      summaryPath: config.summaryPath,
      status: thresholdsMet ? "pass" : "fail",
      thresholdsMet,
      metrics
    });
  }

  return {
    mode: policy.mode,
    minimumStableRunsBeforeEnforce: policy.minimumStableRunsBeforeEnforce,
    allThresholdsMet,
    missingSummaries,
    packageResults
  };
}
