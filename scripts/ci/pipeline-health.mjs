import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const HEALTH_WORKFLOWS = ["merge-contract.yml", "deploy.yml"];
const DEFAULT_SAMPLE_SIZE = 20;
const FAILED_CONCLUSIONS = new Set([
  "action_required",
  "cancelled",
  "failure",
  "startup_failure",
  "stale",
  "timed_out"
]);

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function parseSampleSize(value) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SAMPLE_SIZE;
  }
  return Math.min(parsed, 100);
}

function calculatePercentile(sortedValues, percentile) {
  if (sortedValues.length === 0) {
    return null;
  }

  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
}

function toSeconds(isoStart, isoEnd) {
  if (!isoStart || !isoEnd) {
    return null;
  }

  const startMs = Date.parse(isoStart);
  const endMs = Date.parse(isoEnd);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }

  return Math.round((endMs - startMs) / 1000);
}

function summarizeWorkflowRuns(workflow, runs) {
  const completed = runs.filter((run) => run.status === "completed");
  const durations = completed
    .map((run) => toSeconds(run.run_started_at, run.updated_at))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  const successCount = completed.filter((run) => run.conclusion === "success").length;
  const skippedCount = completed.filter((run) => run.conclusion === "skipped").length;
  const failedCount = completed.filter((run) => FAILED_CONCLUSIONS.has(run.conclusion)).length;
  const neutralCount = completed.filter((run) => run.conclusion === "neutral").length;
  const successRate =
    completed.length > 0 ? Number(((successCount / completed.length) * 100).toFixed(2)) : null;

  return {
    workflow,
    totalRuns: runs.length,
    completedRuns: completed.length,
    successCount,
    failedCount,
    skippedCount,
    neutralCount,
    successRate,
    medianDurationSeconds: calculatePercentile(durations, 50),
    p95DurationSeconds: calculatePercentile(durations, 95)
  };
}

async function fetchWorkflowRuns({ owner, repo, workflowFile, sampleSize, token }) {
  const endpoint = new URL(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/runs`
  );
  endpoint.searchParams.set("per_page", String(sampleSize));
  endpoint.searchParams.set("page", "1");

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to fetch runs for ${workflowFile}: HTTP ${response.status} ${response.statusText} ${body}`
    );
  }

  const payload = await response.json();
  if (!Array.isArray(payload.workflow_runs)) {
    throw new Error(`Invalid workflow run payload for ${workflowFile}`);
  }

  return payload.workflow_runs;
}

async function appendStepSummary(markdown) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }
  await writeFile(summaryPath, `${markdown}\n`, { flag: "a", encoding: "utf8" });
}

async function main() {
  const token = requireEnv("GITHUB_TOKEN");
  const repository = requireEnv("GITHUB_REPOSITORY");
  const sha = requireEnv("GITHUB_SHA");
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    throw new Error(`GITHUB_REPOSITORY must be owner/repo, got: ${repository}`);
  }

  const sampleSize = parseSampleSize(process.env.PIPELINE_HEALTH_SAMPLE_SIZE);
  const summaries = [];

  for (const workflow of HEALTH_WORKFLOWS) {
    const runs = await fetchWorkflowRuns({
      owner,
      repo,
      workflowFile: workflow,
      sampleSize,
      token
    });
    summaries.push(summarizeWorkflowRuns(workflow, runs));
  }

  const payload = {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    repository,
    sha,
    sampleSize,
    workflows: summaries
  };

  const outputPath = path.join(".artifacts", "ci-health", sha, "summary.json");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const tableRows = summaries
    .map(
      (entry) =>
        `| \`${entry.workflow}\` | ${entry.completedRuns}/${entry.totalRuns} | ${
          entry.successRate === null ? "n/a" : `${entry.successRate}%`
        } | ${
          entry.medianDurationSeconds === null ? "n/a" : `${entry.medianDurationSeconds}s`
        } | ${entry.p95DurationSeconds === null ? "n/a" : `${entry.p95DurationSeconds}s`} | ${
          entry.failedCount
        } | ${entry.skippedCount} |`
    )
    .join("\n");

  await appendStepSummary(
    [
      "## Pipeline Health",
      "",
      `Sample size per workflow: ${sampleSize}`,
      "",
      "| Workflow | Completed/Total | Success Rate | Median Duration | P95 Duration | Failed | Skipped |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
      tableRows
    ].join("\n")
  );

  console.info(`Pipeline health summary written to ${outputPath}`);
}

void main();
