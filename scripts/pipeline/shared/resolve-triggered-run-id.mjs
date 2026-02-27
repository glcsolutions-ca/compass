import { appendGithubOutput, requireEnv } from "./pipeline-utils.mjs";
import { withCcsGuardrail } from "./ccs-contract.mjs";

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

async function resolveRunForStatus({
  token,
  repository,
  workflowFile,
  headSha,
  event,
  status,
  perPage
}) {
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
  return run ?? null;
}

async function main() {
  const token = requireEnv("GITHUB_TOKEN");
  const repository = requireEnv("GITHUB_REPOSITORY");
  const workflowFile = requireEnv("WORKFLOW_FILE");
  const headSha = requireEnv("HEAD_SHA");

  const event = process.env.RUN_EVENT?.trim() || "";
  const statuses = [
    process.env.RUN_STATUS?.trim() || "success",
    process.env.RUN_STATUS_FALLBACK?.trim() || ""
  ]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .filter((value, index, values) => values.indexOf(value) === index);
  const perPage = Number.parseInt(process.env.RUN_LOOKUP_LIMIT ?? "50", 10) || 50;

  let run = null;
  let matchedStatus = "";
  for (const status of statuses) {
    run = await resolveRunForStatus({
      token,
      repository,
      workflowFile,
      headSha,
      event,
      status,
      perPage
    });
    if (run) {
      matchedStatus = status;
      break;
    }
  }

  if (!run) {
    throw new Error(`No ${statuses.join(" or ")} ${workflowFile} run found for ${headSha}`);
  }

  await appendGithubOutput({
    run_id: String(run.id),
    run_url: String(run.html_url || "")
  });

  console.info(`Resolved ${workflowFile} run ${run.id} for ${headSha} (status=${matchedStatus})`);
  return { status: "pass", code: "TRIGGERED_RUN000" };
}

void withCcsGuardrail({
  guardrailId: "triggered-run.resolve",
  command: "node scripts/pipeline/shared/resolve-triggered-run-id.mjs",
  passCode: "TRIGGERED_RUN000",
  passRef: "docs/ccs.md#output-format",
  run: main,
  mapError: (error) => ({
    code: "TRIGGERED_RUN001",
    why: error instanceof Error ? error.message : String(error),
    fix: "Resolve workflow run resolution inputs and retry.",
    doCommands: ["node scripts/pipeline/shared/resolve-triggered-run-id.mjs"],
    ref: "docs/ccs.md#output-format"
  })
});
