import { appendGithubOutput, getHeadSha, requireEnv, writeDeployArtifact } from "./utils.mjs";

const GITHUB_API_VERSION = "2022-11-28";

function parsePositiveInteger(rawValue, fallback) {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected positive integer, received: ${rawValue}`);
  }

  return parsed;
}

async function githubRequest(token, pathname) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": "compass-auth-canary-freshness"
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API request failed (${response.status}) ${pathname}\n${body}`);
  }

  return response.json();
}

async function main() {
  const githubToken = requireEnv("GITHUB_TOKEN");
  const repository = requireEnv("GITHUB_REPOSITORY");
  const workflowFile = process.env.AUTH_CANARY_WORKFLOW_FILE?.trim() || "auth-entra-canary.yml";
  const branch = process.env.AUTH_CANARY_BRANCH?.trim() || "main";
  const requiredHeadSha = process.env.AUTH_CANARY_REQUIRED_HEAD_SHA?.trim() || "";
  const artifactName = process.env.AUTH_CANARY_ARTIFACT_NAME?.trim() || "auth-canary-freshness";
  const requiredRunArtifactName = process.env.AUTH_CANARY_REQUIRED_ARTIFACT_NAME?.trim() || "";
  const maxAgeHours = parsePositiveInteger(process.env.AUTH_CANARY_MAX_AGE_HOURS, 24);
  const nowMs = Date.now();

  const params = new URLSearchParams({
    status: "success",
    per_page: "50"
  });
  if (branch.length > 0) {
    params.set("branch", branch);
  }
  const data = await githubRequest(
    githubToken,
    `/repos/${repository}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?${params.toString()}`
  );

  const successfulRuns = Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
  const latestRun =
    requiredHeadSha.length > 0
      ? (successfulRuns.find(
          (run) => typeof run?.head_sha === "string" && run.head_sha === requiredHeadSha
        ) ?? null)
      : (successfulRuns[0] ?? null);
  const lastSuccessAtRaw = latestRun?.updated_at;
  const lastSuccessAtMs = lastSuccessAtRaw ? Date.parse(lastSuccessAtRaw) : Number.NaN;
  const ageHours =
    Number.isFinite(lastSuccessAtMs) && lastSuccessAtMs > 0
      ? (nowMs - lastSuccessAtMs) / (60 * 60 * 1000)
      : null;

  let status = "pass";
  let reasonCode = "";
  let reason = "";
  let requiredArtifactFound = null;
  let runArtifactNames = [];

  if (!latestRun) {
    status = "fail";
    if (requiredHeadSha.length > 0) {
      reasonCode = "AUTH_CANARY_SHA_NOT_FOUND";
      reason = `No successful workflow run found for ${workflowFile} on branch ${branch} and sha ${requiredHeadSha}`;
    } else {
      reasonCode = "AUTH_CANARY_NOT_FOUND";
      reason = `No successful workflow run found for ${workflowFile} on branch ${branch}`;
    }
  } else if (ageHours === null) {
    status = "fail";
    reasonCode = "AUTH_CANARY_TIMESTAMP_INVALID";
    reason = `Latest successful run for ${workflowFile} has invalid updated_at timestamp`;
  } else if (ageHours > maxAgeHours) {
    status = "fail";
    reasonCode = "AUTH_CANARY_STALE";
    reason = `Latest successful ${workflowFile} run is ${ageHours.toFixed(2)}h old (limit ${maxAgeHours}h)`;
  }

  if (status === "pass" && latestRun && requiredRunArtifactName) {
    const artifactsResponse = await githubRequest(
      githubToken,
      `/repos/${repository}/actions/runs/${latestRun.id}/artifacts?per_page=100`
    );
    const artifacts = Array.isArray(artifactsResponse?.artifacts)
      ? artifactsResponse.artifacts
      : [];
    runArtifactNames = artifacts
      .map((artifact) => (typeof artifact?.name === "string" ? artifact.name : ""))
      .filter((name) => name.length > 0);
    requiredArtifactFound = runArtifactNames.includes(requiredRunArtifactName);

    if (!requiredArtifactFound) {
      status = "fail";
      reasonCode = "AUTH_CANARY_ARTIFACT_MISSING";
      reason = `Run ${latestRun.id} for ${workflowFile} is missing required artifact: ${requiredRunArtifactName}`;
    }
  }

  const artifactPath = await writeDeployArtifact(artifactName, {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha: getHeadSha(),
    status,
    reasonCode,
    reason,
    workflowFile,
    branch,
    requiredHeadSha,
    requiredRunArtifactName,
    requiredArtifactFound,
    runArtifactNames,
    maxAgeHours,
    lastSuccess: latestRun
      ? {
          id: latestRun.id,
          runNumber: latestRun.run_number,
          htmlUrl: latestRun.html_url,
          status: latestRun.status,
          conclusion: latestRun.conclusion,
          updatedAt: latestRun.updated_at
        }
      : null,
    ageHours
  });

  await appendGithubOutput({
    auth_canary_freshness_status: status,
    auth_canary_freshness_path: artifactPath
  });

  if (status !== "pass") {
    throw new Error(
      `Auth canary freshness check failed (${reasonCode || "AUTH_CANARY_FRESHNESS_FAILED"}): ${reason}`
    );
  }
}

void main();
