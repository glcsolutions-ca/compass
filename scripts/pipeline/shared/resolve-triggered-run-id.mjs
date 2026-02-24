import { appendGithubOutput, requireEnv } from "./pipeline-utils.mjs";

const GITHUB_API_VERSION = "2022-11-28";

async function githubRequest(token, pathname) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": "compass-pipeline"
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
  const workflowFile = requireEnv("WORKFLOW_FILE");
  const headSha = requireEnv("HEAD_SHA");

  const event = process.env.RUN_EVENT?.trim() || "";
  const status = process.env.RUN_STATUS?.trim() || "success";
  const perPage = Number.parseInt(process.env.RUN_LOOKUP_LIMIT ?? "50", 10) || 50;

  const params = new URLSearchParams({
    status,
    per_page: String(perPage)
  });
  if (event) {
    params.set("event", event);
  }

  const data = await githubRequest(
    token,
    `/repos/${repository}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?${params.toString()}`
  );

  const run = (data.workflow_runs || []).find((entry) => entry.head_sha === headSha);
  if (!run) {
    throw new Error(`No ${status} ${workflowFile} run found for ${headSha}`);
  }

  await appendGithubOutput({
    run_id: String(run.id),
    run_url: String(run.html_url || "")
  });

  console.info(`Resolved ${workflowFile} run ${run.id} for ${headSha}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
