import path from "node:path";
import {
  appendGithubOutput,
  appendGithubStepSummary,
  loadPipelinePolicy,
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

  const policyPath =
    process.env.PIPELINE_POLICY_PATH ?? path.join(".github", "policy", "pipeline-policy.json");
  const policy = await loadPipelinePolicy(policyPath);
  const cloudDeploymentPipelineSlo = policy.cloudDeploymentPipeline?.slo ?? {};
  const sloMode = String(cloudDeploymentPipelineSlo.mode || "observe")
    .trim()
    .toLowerCase();
  const deployCloudTarget = parseTarget(cloudDeploymentPipelineSlo.deployCloudTargetSeconds);
  const productionSmokeTarget = parseTarget(
    cloudDeploymentPipelineSlo.productionSmokeTargetSeconds
  );

  const { run, jobs } = await fetchRunAndJobs({ token, repository, runId });

  const commitStart = earliestStartEpoch(jobs, [
    "verify-integration-gate-evidence",
    "verify-commit-stage-evidence",
    "determine-scope"
  ]);
  const commitEnd = latestEndEpoch(jobs, ["determine-scope"]);

  const releaseCandidateStart = earliestStartEpoch(jobs, [
    "build-release-candidate-api-image",
    "build-release-candidate-web-image",
    "build-release-candidate-worker-image",
    "build-release-candidate-codex-image"
  ]);
  const releaseCandidateEnd = latestEndEpoch(jobs, ["publish-release-candidate"]);

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

  const commitDuration = durationFromRange(commitStart, commitEnd);
  const releaseCandidateDuration = durationFromRange(releaseCandidateStart, releaseCandidateEnd);
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
      commitStageSeconds: commitDuration,
      releaseCandidateBuildSeconds: releaseCandidateDuration,
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
      `- commit stage: ${formatMetric(commitDuration)}`,
      `- release candidate build: ${formatMetric(releaseCandidateDuration)}`,
      `- deploy cloud: ${formatMetric(deployCloudDuration)}`,
      `- production smoke: ${formatMetric(productionSmokeDuration)}`,
      `- SLO mode: \`${sloMode}\``,
      `- deploy cloud target: ${formatMetric(deployCloudTarget)}`,
      `- production smoke target: ${formatMetric(productionSmokeTarget)}`
    ].join("\n")
  );
}

void main();
