import path from "node:path";
import {
  appendGithubOutput,
  appendGithubStepSummary,
  writeJsonFile,
  requireEnv
} from "./pipeline-utils.mjs";

const GITHUB_API_VERSION = "2022-11-28";

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

async function githubRequest(token, pathname) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": "compass-cloud-deployment-stage-timing"
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

function getJobByName(jobs, name) {
  return jobs.find((job) => job?.name === name);
}

function earliestStartEpoch(jobs, names) {
  let earliest = null;
  for (const name of names) {
    const startedAt = parseIsoToEpochSeconds(getJobByName(jobs, name)?.started_at);
    if (startedAt === null) {
      continue;
    }
    if (earliest === null || startedAt < earliest) {
      earliest = startedAt;
    }
  }
  return earliest;
}

function latestEndEpoch(jobs, names) {
  let latest = null;
  for (const name of names) {
    const completedAt = parseIsoToEpochSeconds(getJobByName(jobs, name)?.completed_at);
    if (completedAt === null) {
      continue;
    }
    if (latest === null || completedAt > latest) {
      latest = completedAt;
    }
  }
  return latest;
}

function durationFromRange(startEpoch, endEpoch) {
  if (startEpoch === null || endEpoch === null || endEpoch < startEpoch) {
    return null;
  }
  return endEpoch - startEpoch;
}

function formatMetric(value) {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }
  return `${value}s`;
}

function parseTarget(value) {
  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function coalesceEpoch(...values) {
  for (const value of values) {
    if (value !== null && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function stagePass(duration, target) {
  if (duration === null || target === null) {
    return null;
  }
  return duration <= target;
}

function collectSlowestJobs(jobs, limit = 3) {
  return jobs
    .map((job) => {
      const startedAt = parseIsoToEpochSeconds(job?.started_at);
      const completedAt = parseIsoToEpochSeconds(job?.completed_at);
      const durationSeconds =
        startedAt !== null && completedAt !== null && completedAt >= startedAt
          ? completedAt - startedAt
          : null;

      return {
        name: job?.name || "unknown",
        conclusion: job?.conclusion || "",
        status: job?.status || "",
        durationSeconds
      };
    })
    .filter((job) => job.durationSeconds !== null)
    .sort((a, b) => b.durationSeconds - a.durationSeconds)
    .slice(0, limit);
}

async function main() {
  const token = requireEnv("GITHUB_TOKEN");
  const repository = requireEnv("GITHUB_REPOSITORY");
  const runId = requireEnv("GITHUB_RUN_ID");
  const headSha = process.env.HEAD_SHA?.trim() || process.env.GITHUB_SHA?.trim() || "unknown";

  const rawSloMode = String(process.env.CLOUD_DEPLOYMENT_SLO_MODE || "observe")
    .trim()
    .toLowerCase();
  const sloMode = rawSloMode === "enforce" ? "enforce" : "observe";
  const deployCloudTarget = parseTarget(
    Number.parseInt(process.env.CLOUD_DEPLOYMENT_DEPLOY_TARGET_SECONDS ?? "1200", 10)
  );
  const productionSmokeTarget = parseTarget(
    Number.parseInt(process.env.CLOUD_DEPLOYMENT_SMOKE_TARGET_SECONDS ?? "600", 10)
  );

  const { run, jobs } = await fetchRunAndJobs({ token, repository, runId });

  const resolveSourceStart = earliestStartEpoch(jobs, [
    "resolve-acceptance-source",
    "resolve-replay-source"
  ]);
  const resolveSourceEnd = latestEndEpoch(jobs, [
    "resolve-acceptance-source",
    "resolve-replay-source"
  ]);

  const loadCandidateStart = earliestStartEpoch(jobs, ["load-release-candidate"]);
  const loadCandidateEnd = latestEndEpoch(jobs, ["load-release-candidate"]);

  const promotionStart = earliestStartEpoch(jobs, [
    "promote-predeployed-revisions",
    "deploy-cloud"
  ]);
  const promotionEnd = latestEndEpoch(jobs, ["promote-predeployed-revisions", "deploy-cloud"]);

  const trafficShiftStart = earliestStartEpoch(jobs, ["promote-predeployed-revisions"]);
  const trafficShiftEnd = latestEndEpoch(jobs, ["promote-predeployed-revisions"]);

  const deployCloudStart = earliestStartEpoch(jobs, ["deploy-cloud"]);
  const deployCloudEnd = latestEndEpoch(jobs, ["deploy-cloud"]);

  const productionSmokeStart = earliestStartEpoch(jobs, ["production-smoke"]);
  const productionSmokeEnd = latestEndEpoch(jobs, ["production-smoke"]);

  const runCreatedAt = parseIsoToEpochSeconds(run?.created_at);
  const runUpdatedAt = parseIsoToEpochSeconds(run?.updated_at);
  const overallStart = earliestStartEpoch(
    jobs,
    jobs.map((job) => job.name)
  );
  const overallExecutionSeconds = durationFromRange(overallStart, runUpdatedAt);
  const queueDelaySeconds = durationFromRange(runCreatedAt, overallStart);

  const acceptanceSourceDuration = durationFromRange(resolveSourceStart, resolveSourceEnd);
  const loadReleaseCandidateDuration = durationFromRange(loadCandidateStart, loadCandidateEnd);
  const promotionDuration = durationFromRange(promotionStart, promotionEnd);
  const trafficShiftDuration = durationFromRange(trafficShiftStart, trafficShiftEnd);
  const acceptancePrepDuration = durationFromRange(
    coalesceEpoch(resolveSourceStart, loadCandidateStart),
    coalesceEpoch(loadCandidateEnd, resolveSourceEnd)
  );
  const deployCloudDuration = durationFromRange(deployCloudStart, deployCloudEnd);
  const productionSmokeDuration = durationFromRange(productionSmokeStart, productionSmokeEnd);

  const payload = {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    runId,
    headSha,
    runStatus: run?.status ?? "unknown",
    runConclusion: run?.conclusion ?? "",
    metrics: {
      queueDelaySeconds,
      overallExecutionSeconds,
      acceptanceSourceResolveSeconds: acceptanceSourceDuration,
      loadReleaseCandidateSeconds: loadReleaseCandidateDuration,
      promotionSeconds: promotionDuration,
      trafficShiftPromotionSeconds: trafficShiftDuration,
      // Backward-compatible aliases kept for existing dashboards.
      commitStageSeconds: acceptancePrepDuration,
      releaseCandidateBuildSeconds: null,
      deployCloudSeconds: deployCloudDuration,
      productionSmokeSeconds: productionSmokeDuration
    },
    slo: {
      mode: sloMode,
      deployCloudTargetSeconds: deployCloudTarget,
      productionSmokeTargetSeconds: productionSmokeTarget,
      deployCloudPass: stagePass(deployCloudDuration, deployCloudTarget),
      productionSmokePass: stagePass(productionSmokeDuration, productionSmokeTarget)
    },
    slowestJobsTop3: collectSlowestJobs(jobs, 3)
  };

  const artifactPath = path.join(".artifacts", "pipeline", headSha, "timing.json");
  await writeJsonFile(artifactPath, payload);

  await appendGithubOutput({
    pipeline_timing_path: artifactPath,
    cloud_deployment_pipeline_deploy_cloud_seconds:
      deployCloudDuration === null ? "" : String(deployCloudDuration),
    cloud_deployment_pipeline_production_smoke_seconds:
      productionSmokeDuration === null ? "" : String(productionSmokeDuration)
  });

  await appendGithubStepSummary(
    [
      "### Cloud Deployment Pipeline Timing",
      `- queue delay (non-SLO): ${formatMetric(queueDelaySeconds)}`,
      `- overall execution: ${formatMetric(overallExecutionSeconds)}`,
      `- resolve acceptance source: ${formatMetric(acceptanceSourceDuration)}`,
      `- load release candidate: ${formatMetric(loadReleaseCandidateDuration)}`,
      `- promotion path (traffic shift or deploy): ${formatMetric(promotionDuration)}`,
      `- deploy cloud: ${formatMetric(deployCloudDuration)}`,
      `- production smoke: ${formatMetric(productionSmokeDuration)}`,
      `- SLO mode: \`${sloMode}\``,
      `- deploy cloud target: ${formatMetric(deployCloudTarget)}`,
      `- production smoke target: ${formatMetric(productionSmokeTarget)}`
    ].join("\n")
  );
}

void main();
