import path from "node:path";
import {
  appendGithubStepSummary,
  loadPipelinePolicy,
  requireEnv,
  writeJsonFile
} from "./pipeline-utils.mjs";

const GITHUB_API_VERSION = "2022-11-28";
const DEFAULT_SAMPLE_SIZE = 20;
const STAGE_JOB_NAMES = [
  "build-compile",
  "migration-safety",
  "runtime-contract-smoke",
  "minimal-integration-smoke",
  "integration-gate"
];

function parseIsoToEpochSeconds(value) {
  if (!value) {
    return null;
  }

  const milliseconds = Date.parse(value);
  if (Number.isNaN(milliseconds)) {
    return null;
  }

  return Math.floor(milliseconds / 1000);
}

function durationSeconds(startIso, endIso) {
  const start = parseIsoToEpochSeconds(startIso);
  const end = parseIsoToEpochSeconds(endIso);
  if (start === null || end === null || end < start) {
    return null;
  }

  return end - start;
}

function percentile(values, percentileRank) {
  const finiteValues = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (finiteValues.length === 0) {
    return null;
  }

  if (finiteValues.length === 1) {
    return finiteValues[0];
  }

  const rank = Math.min(
    finiteValues.length - 1,
    Math.max(0, Math.ceil((percentileRank / 100) * finiteValues.length) - 1)
  );
  return finiteValues[rank];
}

function safeRatio(numerator, denominator) {
  if (!Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return Number((numerator / denominator).toFixed(4));
}

function summarizeStageOutcomes(stageCounters) {
  return Object.fromEntries(
    Object.entries(stageCounters).map(([stageName, counts]) => {
      const evaluated =
        counts.success + counts.failure + counts.cancelled + counts.timed_out + counts.skipped;
      return [
        stageName,
        {
          ...counts,
          passRate: safeRatio(counts.success, evaluated),
          failureRate: safeRatio(counts.failure + counts.cancelled + counts.timed_out, evaluated)
        }
      ];
    })
  );
}

async function githubRequest(token, pathname) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": "compass-integration-gate-metrics"
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API request failed (${response.status}) ${pathname}\n${body}`);
  }

  return response.json();
}

async function fetchRunAndJobs({ token, repository, runId }) {
  const run = await githubRequest(token, `/repos/${repository}/actions/runs/${runId}`);

  const jobs = [];
  let page = 1;
  while (true) {
    const response = await githubRequest(
      token,
      `/repos/${repository}/actions/runs/${runId}/jobs?per_page=100&page=${page}`
    );
    const entries = Array.isArray(response.jobs) ? response.jobs : [];
    jobs.push(...entries);
    if (entries.length < 100) {
      break;
    }
    page += 1;
  }

  return { run, jobs };
}

async function fetchRecentIntegrationGateRuns({
  token,
  repository,
  workflowFile,
  workflowEvent,
  sampleSize
}) {
  const runs = [];
  let page = 1;

  while (runs.length < sampleSize) {
    const params = new URLSearchParams({
      event: workflowEvent,
      per_page: "100",
      page: String(page)
    });

    const response = await githubRequest(
      token,
      `/repos/${repository}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?${params.toString()}`
    );

    const entries = Array.isArray(response.workflow_runs) ? response.workflow_runs : [];
    runs.push(...entries);

    if (entries.length < 100) {
      break;
    }

    page += 1;
  }

  return runs.slice(0, sampleSize);
}

function getJobByName(jobs, name) {
  return jobs.find((job) => job?.name === name) || null;
}

function getCurrentRunStageDurations(jobs) {
  const durations = {};
  for (const stageName of STAGE_JOB_NAMES) {
    const job = getJobByName(jobs, stageName);
    durations[stageName] = durationSeconds(job?.started_at, job?.completed_at);
  }
  return durations;
}

function getCurrentRunQueueDelay(run, jobs) {
  const runCreatedAt = parseIsoToEpochSeconds(run?.created_at);
  const earliestJobStart = jobs
    .map((job) => parseIsoToEpochSeconds(job?.started_at))
    .filter((value) => value !== null)
    .sort((a, b) => a - b)[0];

  if (runCreatedAt === null || earliestJobStart === undefined || earliestJobStart < runCreatedAt) {
    return null;
  }

  return earliestJobStart - runCreatedAt;
}

function getCurrentRunTimeToGate(jobs) {
  const determineScopeStart = parseIsoToEpochSeconds(
    getJobByName(jobs, "determine-scope")?.started_at
  );
  const gateCompletedAt = parseIsoToEpochSeconds(
    getJobByName(jobs, "integration-gate")?.completed_at
  );

  if (
    determineScopeStart === null ||
    gateCompletedAt === null ||
    gateCompletedAt < determineScopeStart
  ) {
    return null;
  }

  return gateCompletedAt - determineScopeStart;
}

async function collectStageOutcomes({ token, repository, runs }) {
  const counters = Object.fromEntries(
    STAGE_JOB_NAMES.map((stageName) => [
      stageName,
      { success: 0, failure: 0, cancelled: 0, timed_out: 0, skipped: 0, missing: 0 }
    ])
  );

  for (const run of runs) {
    const runId = run?.id;
    if (!runId) {
      continue;
    }

    const jobsResponse = await githubRequest(
      token,
      `/repos/${repository}/actions/runs/${runId}/jobs?per_page=100`
    );
    const jobs = Array.isArray(jobsResponse.jobs) ? jobsResponse.jobs : [];

    for (const stageName of STAGE_JOB_NAMES) {
      const job = getJobByName(jobs, stageName);
      if (!job) {
        counters[stageName].missing += 1;
        continue;
      }

      const conclusion = String(job.conclusion || "").toLowerCase();
      switch (conclusion) {
        case "success":
          counters[stageName].success += 1;
          break;
        case "failure":
          counters[stageName].failure += 1;
          break;
        case "cancelled":
          counters[stageName].cancelled += 1;
          break;
        case "timed_out":
          counters[stageName].timed_out += 1;
          break;
        case "skipped":
          counters[stageName].skipped += 1;
          break;
        default:
          counters[stageName].missing += 1;
          break;
      }
    }
  }

  return summarizeStageOutcomes(counters);
}

function parseSampleSize(policy, rawOverride) {
  const override = Number.parseInt(rawOverride ?? "", 10);
  if (Number.isFinite(override) && override > 0) {
    return override;
  }

  const policyValue = Number.parseInt(policy.integrationGate?.telemetry?.sampleSize ?? "", 10);
  if (Number.isFinite(policyValue) && policyValue > 0) {
    return policyValue;
  }

  return DEFAULT_SAMPLE_SIZE;
}

function formatMetric(value) {
  if (!Number.isFinite(value) || value === null) {
    return "n/a";
  }
  return `${value}s`;
}

function formatRate(value) {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }
  return `${(value * 100).toFixed(1)}%`;
}

async function main() {
  const token = requireEnv("GITHUB_TOKEN");
  const repository = requireEnv("GITHUB_REPOSITORY");
  const runId = requireEnv("GITHUB_RUN_ID");
  const headSha = process.env.HEAD_SHA?.trim() || process.env.GITHUB_SHA?.trim() || "unknown";
  const workflowFile = process.env.INTEGRATION_GATE_WORKFLOW_FILE?.trim() || "integration-gate.yml";
  const workflowEvent = process.env.INTEGRATION_GATE_EVENT?.trim() || "push";
  const policyPath =
    process.env.PIPELINE_POLICY_PATH ?? path.join(".github", "policy", "pipeline-policy.json");

  const policy = await loadPipelinePolicy(policyPath);
  const sampleSize = parseSampleSize(policy, process.env.INTEGRATION_GATE_SAMPLE_SIZE);

  const [{ run, jobs }, recentRuns] = await Promise.all([
    fetchRunAndJobs({ token, repository, runId }),
    fetchRecentIntegrationGateRuns({
      token,
      repository,
      workflowFile,
      workflowEvent,
      sampleSize
    })
  ]);

  const completedRuns = recentRuns.filter((entry) => entry?.status === "completed");
  const successfulRuns = completedRuns.filter((entry) => entry?.conclusion === "success");
  const rerunCount = recentRuns.filter((entry) => Number(entry?.run_attempt || 1) > 1).length;

  const queueDelaySamples = recentRuns
    .map((entry) => durationSeconds(entry?.created_at, entry?.run_started_at || entry?.created_at))
    .filter((value) => value !== null);
  const totalDurationSamples = recentRuns
    .map((entry) => durationSeconds(entry?.run_started_at || entry?.created_at, entry?.updated_at))
    .filter((value) => value !== null);

  const stageOutcomes = await collectStageOutcomes({ token, repository, runs: recentRuns });

  const payload = {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    runId,
    workflowFile,
    workflowEvent,
    currentRun: {
      queueDelaySeconds: getCurrentRunQueueDelay(run, jobs),
      timeToGateSeconds: getCurrentRunTimeToGate(jobs),
      stageDurationsSeconds: getCurrentRunStageDurations(jobs)
    },
    throughputWindow: {
      sampleSizeRequested: sampleSize,
      sampledRuns: recentRuns.length,
      completedRuns: completedRuns.length,
      successRuns: successfulRuns.length,
      rerunRatio: safeRatio(rerunCount, recentRuns.length),
      queueDelaySeconds: {
        median: percentile(queueDelaySamples, 50),
        p95: percentile(queueDelaySamples, 95)
      },
      totalRunSeconds: {
        median: percentile(totalDurationSamples, 50),
        p95: percentile(totalDurationSamples, 95)
      },
      passRateByStage: stageOutcomes
    }
  };

  const artifactPath = path.join(".artifacts", "integration-gate", headSha, "timing.json");
  await writeJsonFile(artifactPath, payload);

  await appendGithubStepSummary(
    [
      "### Integration Gate Throughput Snapshot",
      `- sampled runs: ${payload.throughputWindow.sampledRuns}`,
      `- rerun ratio: ${formatRate(payload.throughputWindow.rerunRatio)}`,
      `- queue delay median/p95: ${formatMetric(payload.throughputWindow.queueDelaySeconds.median)} / ${formatMetric(payload.throughputWindow.queueDelaySeconds.p95)}`,
      `- total run median/p95: ${formatMetric(payload.throughputWindow.totalRunSeconds.median)} / ${formatMetric(payload.throughputWindow.totalRunSeconds.p95)}`,
      `- integration-gate pass rate: ${formatRate(payload.throughputWindow.passRateByStage["integration-gate"]?.passRate ?? null)}`
    ].join("\n")
  );
}

void main();
