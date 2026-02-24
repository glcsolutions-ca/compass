import path from "node:path";
import { appendGithubOutput, requireEnv, writeJsonFile } from "./pipeline-utils.mjs";

const GITHUB_API_VERSION = "2022-11-28";

async function githubRequest(token, pathname) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": "compass-verify-commit-stage-evidence"
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API request failed (${response.status}) ${pathname}\n${body}`);
  }

  return response.json();
}

async function main() {
  const token = requireEnv("GITHUB_TOKEN");
  const repository = requireEnv("GITHUB_REPOSITORY");
  const headSha = requireEnv("HEAD_SHA");
  const workflowFile = process.env.COMMIT_STAGE_WORKFLOW_FILE?.trim() || "commit-stage.yml";

  const params = new URLSearchParams({
    status: "success",
    per_page: "100"
  });
  const runs = await githubRequest(
    token,
    `/repos/${repository}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?${params.toString()}`
  );
  const successfulRuns = Array.isArray(runs?.workflow_runs) ? runs.workflow_runs : [];
  const matchedRun =
    successfulRuns.find(
      (run) =>
        typeof run?.head_sha === "string" &&
        run.head_sha === headSha &&
        run.conclusion === "success"
    ) ?? null;

  if (!matchedRun) {
    throw new Error(`No successful ${workflowFile} run found for head SHA ${headSha}`);
  }

  const artifactPath = path.join(".artifacts", "commit-stage", headSha, "evidence.json");
  await writeJsonFile(artifactPath, {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    workflowFile,
    commitStageRun: {
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
    commit_stage_run_id: String(matchedRun.id),
    commit_stage_evidence_path: artifactPath
  });
}

void main();
