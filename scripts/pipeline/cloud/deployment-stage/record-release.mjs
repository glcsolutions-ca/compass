import { appendGithubOutput, getHeadSha, requireEnv } from "./utils.mjs";
import { withCcsGuardrail } from "../../shared/ccs-contract.mjs";

const apiVersion = "2022-11-28";
const token = requireEnv("GITHUB_TOKEN");
const repository = requireEnv("GITHUB_REPOSITORY");
const headSha = getHeadSha();
const environment = process.env.TARGET_ENVIRONMENT?.trim() || "production";
const logUrl = process.env.DEPLOY_LOG_URL?.trim() || "";
const environmentUrl = process.env.DEPLOY_ENVIRONMENT_URL?.trim() || "";
const releaseCandidateApiRef = process.env.RELEASE_CANDIDATE_API_REF?.trim() || "";
const releaseCandidateWebRef = process.env.RELEASE_CANDIDATE_WEB_REF?.trim() || "";
const releaseCandidateWorkerRef = process.env.RELEASE_CANDIDATE_WORKER_REF?.trim() || "";
const releaseCandidateDynamicSessionsRuntimeRef =
  process.env.RELEASE_CANDIDATE_DYNAMIC_SESSIONS_RUNTIME_REF?.trim() || "";
const changeClass = process.env.CHANGE_CLASS?.trim() || "runtime";
const maxRetryAttempts = 3;
const baseRetryDelayMs = 1000;

async function githubRequest(pathname, options = {}) {
  const method = options.method || "GET";
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": apiVersion,
    "User-Agent": "compass-release-pipeline",
    ...(options.body ? { "Content-Type": "application/json" } : {})
  };
  const bodyPayload = options.body ? JSON.stringify(options.body) : undefined;

  for (let attempt = 0; attempt <= maxRetryAttempts; attempt += 1) {
    const response = await fetch(`https://api.github.com${pathname}`, {
      method,
      headers,
      body: bodyPayload
    });

    if (response.ok) {
      return response.json();
    }

    const responseBody = await response.text();
    const status = response.status;
    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    const shouldRetry = (status === 429 || status >= 500) && attempt < maxRetryAttempts;
    if (!shouldRetry) {
      throw new Error(`GitHub API request failed (${status}): ${pathname}\n${responseBody}`);
    }

    const exponentialBackoffMs = baseRetryDelayMs * 2 ** attempt;
    const retryAfterMs =
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 0;
    const backoffMs = Math.max(exponentialBackoffMs, retryAfterMs);
    console.warn(
      `GitHub API request ${pathname} returned ${status}; retrying ${attempt + 1}/${maxRetryAttempts} in ${backoffMs}ms`
    );
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }
}

async function main() {
  const deployment = await githubRequest(`/repos/${repository}/deployments`, {
    method: "POST",
    body: {
      ref: headSha,
      environment,
      auto_merge: false,
      required_contexts: [],
      transient_environment: false,
      production_environment: environment === "production",
      description: `Release candidate promotion (${changeClass})`,
      payload: {
        changeClass,
        releaseCandidateApiRef,
        releaseCandidateWebRef,
        releaseCandidateWorkerRef,
        releaseCandidateDynamicSessionsRuntimeRef
      }
    }
  });

  const deploymentId = String(deployment.id);

  await githubRequest(`/repos/${repository}/deployments/${deploymentId}/statuses`, {
    method: "POST",
    body: {
      state: "success",
      log_url: logUrl || undefined,
      environment_url: environmentUrl || undefined,
      description: "Promotion succeeded"
    }
  });

  await appendGithubOutput({
    deployment_id: deploymentId
  });

  console.info(`Recorded successful production deployment ${deploymentId} for ${headSha}`);
  return { status: "pass", code: "RECORD_RELEASE_PASS" };
}

void withCcsGuardrail({
  guardrailId: "deployment.release-record",
  command: "node scripts/pipeline/cloud/deployment-stage/record-release.mjs",
  passCode: "RECORD_RELEASE_PASS",
  passRef: "docs/ccs.md#output-format",
  run: main,
  mapError: (error) => ({
    code: "RECORD_RELEASE_FAIL",
    why: error instanceof Error ? error.message : String(error),
    fix: "Resolve GitHub deployment record creation errors.",
    doCommands: ["node scripts/pipeline/cloud/deployment-stage/record-release.mjs"],
    ref: "docs/ccs.md#output-format"
  })
});
