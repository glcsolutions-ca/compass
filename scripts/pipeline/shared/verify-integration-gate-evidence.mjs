import path from "node:path";
import { appendGithubOutput, requireEnv, writeJsonFile } from "./pipeline-utils.mjs";

const GITHUB_API_VERSION = "2022-11-28";
const DEFAULT_TIMEOUT_SECONDS = 300;
const DEFAULT_POLL_INTERVAL_SECONDS = 10;

async function githubRequest(token, pathname) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": "compass-verify-integration-gate-evidence"
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API request failed (${response.status}) ${pathname}\n${body}`);
  }

  return response.json();
}

function parsePositiveInt(rawValue, fallback) {
  const parsedValue = Number.parseInt(rawValue ?? "", 10);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function findSuccessfulMergeQueueRun({ token, repository, workflowFile, headSha }) {
  const timeoutSeconds = parsePositiveInt(
    process.env.INTEGRATION_GATE_EVIDENCE_TIMEOUT_SECONDS,
    DEFAULT_TIMEOUT_SECONDS
  );
  const pollIntervalSeconds = parsePositiveInt(
    process.env.INTEGRATION_GATE_EVIDENCE_POLL_INTERVAL_SECONDS,
    DEFAULT_POLL_INTERVAL_SECONDS
  );
  const deadline = Date.now() + timeoutSeconds * 1000;
  let latestMatchedRun = null;

  while (Date.now() <= deadline) {
    const params = new URLSearchParams({
      event: "merge_group",
      per_page: "100"
    });
    const runs = await githubRequest(
      token,
      `/repos/${repository}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?${params.toString()}`
    );
    const workflowRuns = Array.isArray(runs?.workflow_runs) ? runs.workflow_runs : [];
    const matchedRun =
      workflowRuns.find((run) => typeof run?.head_sha === "string" && run.head_sha === headSha) ??
      null;

    if (matchedRun) {
      latestMatchedRun = matchedRun;

      if (matchedRun.conclusion === "success") {
        return matchedRun;
      }

      if (
        matchedRun.status === "completed" &&
        matchedRun.conclusion &&
        matchedRun.conclusion !== "success"
      ) {
        throw new Error(
          `${workflowFile} merge_group run for head SHA ${headSha} completed with conclusion '${matchedRun.conclusion}'`
        );
      }
    }

    if (Date.now() + pollIntervalSeconds * 1000 > deadline) {
      break;
    }
    await sleep(pollIntervalSeconds * 1000);
  }

  if (latestMatchedRun) {
    throw new Error(
      `Timed out waiting for successful ${workflowFile} merge_group run for head SHA ${headSha}. Last seen status='${latestMatchedRun.status}' conclusion='${latestMatchedRun.conclusion ?? "pending"}'`
    );
  }

  throw new Error(
    `Timed out waiting for ${workflowFile} merge_group run to appear for head SHA ${headSha}`
  );
}

async function main() {
  const token = requireEnv("GITHUB_TOKEN");
  const repository = requireEnv("GITHUB_REPOSITORY");
  const headSha = requireEnv("HEAD_SHA");
  const workflowFile = process.env.INTEGRATION_GATE_WORKFLOW_FILE?.trim() || "integration-gate.yml";

  const matchedRun = await findSuccessfulMergeQueueRun({
    token,
    repository,
    workflowFile,
    headSha
  });

  const artifactPath = path.join(".artifacts", "integration-gate", headSha, "evidence.json");
  await writeJsonFile(artifactPath, {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    workflowFile,
    integrationGateRun: {
      id: matchedRun.id,
      runNumber: matchedRun.run_number,
      htmlUrl: matchedRun.html_url,
      event: matchedRun.event,
      headBranch: matchedRun.head_branch,
      status: matchedRun.status,
      conclusion: matchedRun.conclusion,
      updatedAt: matchedRun.updated_at
    }
  });

  await appendGithubOutput({
    integration_gate_run_id: String(matchedRun.id),
    integration_gate_evidence_path: artifactPath
  });
}

void main();
