import { appendGithubOutput, getHeadSha, requireEnv } from "./utils.mjs";

const apiVersion = "2022-11-28";
const token = requireEnv("GITHUB_TOKEN");
const repository = requireEnv("GITHUB_REPOSITORY");
const headSha = getHeadSha();
const environment = process.env.TARGET_ENVIRONMENT?.trim() || "production";
const logUrl = process.env.DEPLOY_LOG_URL?.trim() || "";
const environmentUrl = process.env.DEPLOY_ENVIRONMENT_URL?.trim() || "";
const candidateApiRef = process.env.CANDIDATE_API_REF?.trim() || "";
const candidateWebRef = process.env.CANDIDATE_WEB_REF?.trim() || "";
const changeClass = process.env.CHANGE_CLASS?.trim() || "runtime";

async function githubRequest(pathname, options = {}) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    method: options.method || "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": apiVersion,
      "User-Agent": "compass-release-pipeline",
      ...(options.body ? { "Content-Type": "application/json" } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API request failed (${response.status}): ${pathname}\n${body}`);
  }

  return response.json();
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
        candidateApiRef,
        candidateWebRef
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
}

void main();
