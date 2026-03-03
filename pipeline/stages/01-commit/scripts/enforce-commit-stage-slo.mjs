import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseCliArgs, optionalOption, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import { writeJsonFile } from "../../../shared/scripts/pipeline-contract-lib.mjs";

function parsePositiveInteger(name, rawValue) {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseIsoDate(name, rawValue) {
  const value = rawValue.trim();
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a valid ISO-8601 timestamp`);
  }
  return {
    iso: value,
    epochMs: parsed
  };
}

export function evaluateCommitStageSlo(options) {
  const start = parseIsoDate("start", options.start);
  const end = parseIsoDate("end", options.end);
  const warnSeconds = parsePositiveInteger("warn-seconds", String(options.warnSeconds));
  const failSeconds = parsePositiveInteger("fail-seconds", String(options.failSeconds));

  if (warnSeconds >= failSeconds) {
    throw new Error("warn-seconds must be less than fail-seconds");
  }

  const durationSeconds = Math.max(0, Math.round((end.epochMs - start.epochMs) / 1000));

  let verdict = "pass";
  if (durationSeconds > failSeconds) {
    verdict = "fail";
  } else if (durationSeconds > warnSeconds) {
    verdict = "warn";
  }

  return {
    schemaVersion: "commit-stage-metrics.v1",
    generatedAt: new Date().toISOString(),
    commitStageStartAt: start.iso,
    commitStageEndAt: end.iso,
    durationSeconds,
    thresholds: {
      warnSeconds,
      failSeconds
    },
    verdict
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const start = requireOption(options, "start");
  const end = requireOption(options, "end");
  const warnSeconds = parsePositiveInteger("warn-seconds", requireOption(options, "warn-seconds"));
  const failSeconds = parsePositiveInteger("fail-seconds", requireOption(options, "fail-seconds"));
  const outPath = optionalOption(options, "out");

  const metrics = evaluateCommitStageSlo({
    start,
    end,
    warnSeconds,
    failSeconds
  });

  if (outPath) {
    await writeJsonFile(outPath, metrics);
    console.info(`Wrote commit-stage metrics: ${path.resolve(outPath)}`);
  } else {
    console.info(JSON.stringify(metrics, null, 2));
  }

  if (metrics.verdict === "warn") {
    console.warn(
      `Commit stage duration ${metrics.durationSeconds}s exceeded warning threshold ${warnSeconds}s.`
    );
  }

  if (metrics.verdict === "fail") {
    throw new Error(
      `Commit stage duration ${metrics.durationSeconds}s exceeded failure threshold ${failSeconds}s.`
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
