import { appendGithubOutput, requireEnv } from "./utils.mjs";

const apiVersion = "2022-11-28";
const token = requireEnv("GITHUB_TOKEN");
const repository = requireEnv("GITHUB_REPOSITORY");
const headSha = requireEnv("HEAD_SHA");
const targetEnvironment = process.env.TARGET_ENVIRONMENT?.trim() || "production";
const fallbackBaseSha = process.env.FALLBACK_BASE_SHA?.trim() || "";

function isSha(value) {
  return /^[0-9a-f]{40}$/i.test(value);
}

async function githubRequest(pathname) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": apiVersion,
      "User-Agent": "compass-release-pipeline"
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API request failed (${response.status}): ${pathname}\n${body}`);
  }

  return response.json();
}

async function resolveLatestSuccessfulDeployment() {
  const encodedEnvironment = encodeURIComponent(targetEnvironment);
  const deployments = await githubRequest(
    `/repos/${repository}/deployments?environment=${encodedEnvironment}&per_page=25`
  );

  for (const deployment of deployments) {
    const statuses = await githubRequest(
      `/repos/${repository}/deployments/${deployment.id}/statuses?per_page=25`
    );

    const latestStatus = Array.isArray(statuses) && statuses.length > 0 ? statuses[0] : null;
    if (!latestStatus || latestStatus.state !== "success") {
      continue;
    }

    if (!isSha(deployment.sha)) {
      continue;
    }

    return {
      baseSha: deployment.sha,
      baseSource: "deployment-record",
      baseDeploymentId: String(deployment.id)
    };
  }

  return null;
}

async function main() {
  let resolution = await resolveLatestSuccessfulDeployment();

  if (!resolution) {
    const fallbackSha =
      isSha(fallbackBaseSha) && fallbackBaseSha !== headSha ? fallbackBaseSha : "";
    resolution = {
      baseSha: fallbackSha,
      baseSource: "bootstrap-fallback",
      baseDeploymentId: ""
    };
  }

  await appendGithubOutput({
    base_sha: resolution.baseSha,
    base_source: resolution.baseSource,
    base_deployment_id: resolution.baseDeploymentId
  });

  console.info(
    `Resolved base SHA for classification: source=${resolution.baseSource} deploymentId=${resolution.baseDeploymentId || "none"} baseSha=${resolution.baseSha || "(empty; classifier fallback)"}`
  );
}

void main();
