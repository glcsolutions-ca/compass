import path from "node:path";
import {
  appendGithubOutput,
  appendGithubStepSummary,
  loadPipelinePolicy,
  readJsonFile,
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

function parseMode(mode) {
  const normalized = String(mode || "observe")
    .trim()
    .toLowerCase();
  if (normalized === "observe" || normalized === "enforce") {
    return normalized;
  }

  throw new Error(`Unsupported commitStage.slo.mode: ${mode}`);
}

async function githubRequest(token, pathname) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": "compass-pipeline-timing"
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

function durationSeconds(job) {
  const start = parseIsoToEpochSeconds(job?.started_at);
  const end = parseIsoToEpochSeconds(job?.completed_at);
  if (!start || !end || end < start) {
    return null;
  }

  return end - start;
}

function calculateTimeToCommitGate({ runCreatedAt, gateJob, nowEpochSeconds }) {
  if (!runCreatedAt) {
    return null;
  }

  const gateCompletedAt = parseIsoToEpochSeconds(gateJob?.completed_at);
  if (gateCompletedAt && gateCompletedAt >= runCreatedAt) {
    return gateCompletedAt - runCreatedAt;
  }

  if (nowEpochSeconds >= runCreatedAt) {
    return nowEpochSeconds - runCreatedAt;
  }

  return null;
}

function calculateObservedRunSeconds({ runCreatedAt, runUpdatedAt, nowEpochSeconds }) {
  if (!runCreatedAt) {
    return null;
  }

  if (runUpdatedAt && runUpdatedAt >= runCreatedAt) {
    return runUpdatedAt - runCreatedAt;
  }

  if (nowEpochSeconds >= runCreatedAt) {
    return nowEpochSeconds - runCreatedAt;
  }

  return null;
}

function formatMetric(value) {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }
  return `${value}s`;
}

async function main() {
  const token = requireEnv("GITHUB_TOKEN");
  const repository = requireEnv("GITHUB_REPOSITORY");
  const runId = requireEnv("GITHUB_RUN_ID");
  const headSha = process.env.HEAD_SHA?.trim() || process.env.GITHUB_SHA?.trim() || "unknown";
  const testedSha = process.env.TESTED_SHA?.trim() || headSha;
  const phase = process.env.TIMING_PHASE?.trim() || "snapshot";

  const policyPath =
    process.env.PIPELINE_POLICY_PATH ?? path.join(".github", "policy", "pipeline-policy.json");
  const policy = await loadPipelinePolicy(policyPath);
  const sloPolicy = policy.commitStage?.slo ?? {};
  const targetSeconds = Number(sloPolicy.targetSeconds ?? 300);
  const mode = parseMode(sloPolicy.mode ?? "observe");

  const { run, jobs } = await fetchRunAndJobs({ token, repository, runId });
  const nowEpochSeconds = Math.floor(Date.now() / 1000);
  const runCreatedAt = parseIsoToEpochSeconds(run?.created_at);
  const runUpdatedAt = parseIsoToEpochSeconds(run?.updated_at);

  const quickFeedbackJob = jobs.find((job) => job.name === "fast-feedback");
  const gateJob = jobs.find((job) => job.name === "commit-stage");

  const quickFeedbackSeconds = durationSeconds(quickFeedbackJob);
  const timeToCommitGateSeconds = calculateTimeToCommitGate({
    runCreatedAt,
    gateJob,
    nowEpochSeconds
  });
  const totalRunSeconds = calculateObservedRunSeconds({
    runCreatedAt,
    runUpdatedAt,
    nowEpochSeconds
  });

  const sloPass =
    Number.isFinite(timeToCommitGateSeconds) && timeToCommitGateSeconds !== null
      ? timeToCommitGateSeconds <= targetSeconds
      : false;

  const payload = {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    testedSha,
    phase,
    runId,
    runStatus: run?.status ?? "unknown",
    runConclusion: run?.conclusion ?? "",
    metrics: {
      time_to_commit_gate_seconds: timeToCommitGateSeconds,
      quick_feedback_seconds: quickFeedbackSeconds,
      total_run_seconds: totalRunSeconds
    },
    slo: {
      mode,
      targetSeconds,
      pass: sloPass,
      evaluationMetric: "time_to_commit_gate_seconds"
    }
  };

  const artifactPath = path.join(".artifacts", "commit-stage", testedSha, "timing.json");

  let mergedPayload = payload;
  try {
    const existing = await readJsonFile(artifactPath);
    if (existing && typeof existing === "object" && !Array.isArray(existing)) {
      mergedPayload = {
        ...existing,
        ...payload,
        metrics: {
          ...(existing.metrics ?? {}),
          ...payload.metrics
        },
        slo: {
          ...(existing.slo ?? {}),
          ...payload.slo
        }
      };
    }
  } catch {
    // First write wins when no existing artifact is present.
  }

  await writeJsonFile(artifactPath, mergedPayload);

  await appendGithubOutput({
    timing_path: artifactPath,
    time_to_commit_gate_seconds:
      timeToCommitGateSeconds === null ? "" : String(timeToCommitGateSeconds),
    quick_feedback_seconds: quickFeedbackSeconds === null ? "" : String(quickFeedbackSeconds),
    total_run_seconds: totalRunSeconds === null ? "" : String(totalRunSeconds),
    commit_stage_slo_mode: mode,
    commit_stage_slo_target_seconds: String(targetSeconds),
    commit_stage_slo_pass: String(Boolean(sloPass))
  });

  await appendGithubStepSummary(
    [
      "### Commit Stage Timing",
      `- phase: ${phase}`,
      `- tested sha: \`${testedSha}\``,
      `- time to commit gate: ${formatMetric(timeToCommitGateSeconds)}`,
      `- quick feedback duration: ${formatMetric(quickFeedbackSeconds)}`,
      `- observed total run: ${formatMetric(totalRunSeconds)}`,
      `- SLO: mode=\`${mode}\`, target=\`${targetSeconds}s\`, pass=\`${String(Boolean(sloPass))}\``
    ].join("\n")
  );

  if (!sloPass) {
    console.warn(
      `commit-stage timing SLO observed breach: mode=${mode}, target=${targetSeconds}s, observed=${timeToCommitGateSeconds ?? "unknown"}s`
    );
  }

  console.info(`commit-stage timing artifact written: ${artifactPath}`);
}

void main();
