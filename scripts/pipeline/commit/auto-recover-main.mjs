import { writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import {
  appendGithubOutput,
  execGit,
  requireEnv,
  writeJsonFile
} from "../shared/pipeline-utils.mjs";

const GITHUB_API_VERSION = "2022-11-28";
const DETERMINISTIC_FAILURE_JOBS = {
  "Integration Gate": new Set([
    "determine-scope",
    "build-compile",
    "migration-safety",
    "runtime-contract-smoke",
    "minimal-integration-smoke",
    "integration-gate"
  ])
};

function parsePositiveInt(raw, fallback = 1) {
  const parsed = Number.parseInt(String(raw || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

async function githubRequest({ token, method = "GET", pathname, body }) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": "compass-main-red-recovery"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      `GitHub API request failed (${response.status}) ${method} ${pathname}\n${responseText}`
    );
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function fetchAllRunJobs({ token, repository, runId }) {
  const jobs = [];
  let page = 1;
  while (true) {
    const response = await githubRequest({
      token,
      pathname: `/repos/${repository}/actions/runs/${runId}/jobs?per_page=100&page=${page}`
    });
    const entries = Array.isArray(response?.jobs) ? response.jobs : [];
    jobs.push(...entries);
    if (entries.length < 100) {
      break;
    }
    page += 1;
  }
  return jobs;
}

export function collectFailedJobNames(jobs) {
  return jobs
    .filter((job) => String(job?.conclusion || "").toLowerCase() === "failure")
    .map((job) => String(job?.name || "").trim())
    .filter((name) => name.length > 0);
}

export function isRecoveryRevertCommit({
  message = "",
  authorLogin = "",
  committerLogin = ""
} = {}) {
  const normalizedMessage = String(message || "");
  if (/\nMain-Red-Recovery:\s*true\b/i.test(normalizedMessage)) {
    return true;
  }

  const isBotActor =
    String(authorLogin || "")
      .toLowerCase()
      .endsWith("[bot]") &&
    String(committerLogin || "")
      .toLowerCase()
      .endsWith("[bot]");
  return normalizedMessage.startsWith('Revert "') && isBotActor;
}

export function isHardDeterministicFailure({ workflowName, conclusion, failedJobNames }) {
  if (String(conclusion || "").toLowerCase() !== "failure") {
    return false;
  }

  const allowedJobs = DETERMINISTIC_FAILURE_JOBS[workflowName];
  if (!allowedJobs || failedJobNames.length === 0) {
    return false;
  }

  return failedJobNames.every((jobName) => allowedJobs.has(jobName));
}

export function decideRecoveryAction({
  workflowName,
  conclusion,
  runAttempt,
  failedJobNames,
  recoveryRevertCommit
}) {
  if (!DETERMINISTIC_FAILURE_JOBS[workflowName]) {
    return {
      action: "noop",
      reasonCode: "WORKFLOW_NOT_SUPPORTED",
      hardDeterministicFailure: false
    };
  }

  if (recoveryRevertCommit) {
    return {
      action: "noop",
      reasonCode: "HEAD_ALREADY_RECOVERY_REVERT",
      hardDeterministicFailure: false
    };
  }

  const hardDeterministicFailure = isHardDeterministicFailure({
    workflowName,
    conclusion,
    failedJobNames
  });
  if (!hardDeterministicFailure) {
    return {
      action: "noop",
      reasonCode: "NOT_HARD_DETERMINISTIC_FAILURE",
      hardDeterministicFailure
    };
  }

  if (runAttempt <= 1) {
    return {
      action: "rerun-failed-jobs",
      reasonCode: "RERUN_FAILED_JOBS_REQUESTED",
      hardDeterministicFailure
    };
  }

  return {
    action: "revert-head-commit",
    reasonCode: "AUTO_REVERT_REQUIRED",
    hardDeterministicFailure
  };
}

async function performAutoRevert({
  targetBranch,
  headSha,
  workflowName,
  sourceRunId,
  sourceRunAttempt
}) {
  await execGit(["fetch", "origin", targetBranch]);
  const remoteHeadSha = await execGit(["rev-parse", `origin/${targetBranch}`]);
  if (remoteHeadSha !== headSha) {
    return {
      action: "noop",
      reasonCode: "MAIN_ADVANCED_NO_REVERT",
      revertCommitSha: null
    };
  }

  await execGit(["checkout", "-B", targetBranch, `origin/${targetBranch}`]);
  await execGit(["config", "user.name", "github-actions[bot]"]);
  await execGit(["config", "user.email", "github-actions[bot]@users.noreply.github.com"]);

  const subject = await execGit(["show", "-s", "--format=%s", headSha]);
  const messagePath = path.join(tmpdir(), `main-red-recovery-${headSha}.txt`);
  const commitMessage = [
    `Revert "${subject}"`,
    "",
    "Automatically reverted by main-red-recovery after repeated deterministic gate failure.",
    "Main-Red-Recovery: true",
    `Failed-Workflow: ${workflowName}`,
    `Failed-Run-Id: ${sourceRunId}`,
    `Failed-Run-Attempt: ${sourceRunAttempt}`,
    `Failed-Head-Sha: ${headSha}`
  ].join("\n");
  await writeFile(messagePath, `${commitMessage}\n`, "utf8");

  try {
    await execGit(["revert", "--no-commit", headSha]);
    await execGit(["commit", "--file", messagePath]);
  } catch (error) {
    await execGit(["revert", "--abort"]).catch(() => {});
    throw error;
  }

  const revertCommitSha = await execGit(["rev-parse", "HEAD"]);
  await execGit(["push", "origin", `HEAD:${targetBranch}`]);

  return {
    action: "revert-head-commit",
    reasonCode: "AUTO_REVERT_PUSHED",
    revertCommitSha
  };
}

async function main() {
  const token = requireEnv("GITHUB_TOKEN");
  const repository = requireEnv("GITHUB_REPOSITORY");
  const sourceRunId = requireEnv("WORKFLOW_RUN_ID");
  const workflowName = requireEnv("WORKFLOW_NAME");
  const sourceEvent = requireEnv("WORKFLOW_EVENT");
  const headBranch = requireEnv("WORKFLOW_HEAD_BRANCH");
  const headSha = requireEnv("WORKFLOW_HEAD_SHA");
  const conclusion = (process.env.WORKFLOW_CONCLUSION || "").trim();
  const sourceRunAttempt = parsePositiveInt(process.env.WORKFLOW_RUN_ATTEMPT, 1);
  const sourceRunHtmlUrl = process.env.WORKFLOW_RUN_HTML_URL?.trim() || null;
  const targetBranch = (process.env.TARGET_BRANCH || "main").trim();

  const recoveryRunId = process.env.GITHUB_RUN_ID?.trim() || "";
  const serverUrl = process.env.GITHUB_SERVER_URL?.trim() || "https://github.com";
  const recoveryRunHtmlUrl =
    recoveryRunId.length > 0 ? `${serverUrl}/${repository}/actions/runs/${recoveryRunId}` : null;
  const artifactPath = path.join(".artifacts", "main-recovery", headSha, "result.json");

  const basePayload = {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    repository,
    workflowName,
    sourceRunId,
    sourceRunAttempt,
    sourceRunHtmlUrl,
    sourceEvent,
    headBranch,
    headSha,
    conclusion,
    targetBranch,
    recoveryRunId: recoveryRunId || null,
    recoveryRunHtmlUrl
  };

  if (sourceEvent !== "push" || headBranch !== targetBranch) {
    const payload = {
      ...basePayload,
      action: "noop",
      reasonCode: "SOURCE_NOT_MAIN_PUSH_EVENT",
      hardDeterministicFailure: false,
      failedJobs: [],
      revertCommitSha: null
    };
    await writeJsonFile(artifactPath, payload);
    await appendGithubOutput({
      recovery_action: payload.action,
      reason_code: payload.reasonCode,
      recovery_result_path: artifactPath
    });
    return;
  }

  const [jobs, commitResponse] = await Promise.all([
    fetchAllRunJobs({ token, repository, runId: sourceRunId }),
    githubRequest({ token, pathname: `/repos/${repository}/commits/${headSha}` })
  ]);
  const failedJobNames = collectFailedJobNames(jobs);
  const recoveryRevertCommit = isRecoveryRevertCommit({
    message: commitResponse?.commit?.message || "",
    authorLogin: commitResponse?.author?.login || "",
    committerLogin: commitResponse?.committer?.login || ""
  });

  const decision = decideRecoveryAction({
    workflowName,
    conclusion,
    runAttempt: sourceRunAttempt,
    failedJobNames,
    recoveryRevertCommit
  });

  let action = decision.action;
  let reasonCode = decision.reasonCode;
  let revertCommitSha = null;

  if (decision.action === "rerun-failed-jobs") {
    await githubRequest({
      token,
      method: "POST",
      pathname: `/repos/${repository}/actions/runs/${sourceRunId}/rerun-failed-jobs`
    });
  } else if (decision.action === "revert-head-commit") {
    const revertResult = await performAutoRevert({
      targetBranch,
      headSha,
      workflowName,
      sourceRunId,
      sourceRunAttempt
    });
    action = revertResult.action;
    reasonCode = revertResult.reasonCode;
    revertCommitSha = revertResult.revertCommitSha ?? null;
  }

  const payload = {
    ...basePayload,
    action,
    reasonCode,
    hardDeterministicFailure: decision.hardDeterministicFailure,
    failedJobs: failedJobNames,
    recoveryRevertCommit,
    revertCommitSha
  };

  await writeJsonFile(artifactPath, payload);
  await appendGithubOutput({
    recovery_action: action,
    reason_code: reasonCode,
    recovery_result_path: artifactPath,
    revert_commit_sha: revertCommitSha || ""
  });
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsScript) {
  void main();
}
