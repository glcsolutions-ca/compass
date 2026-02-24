import { appendGithubOutput, getHeadSha, requireEnv, writeDeployArtifact } from "./utils.mjs";

const targetBaseUrl = requireEnv("TARGET_API_BASE_URL").replace(/\/$/, "");

function requireOneOfEnv(names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  throw new Error(`Missing required environment variable: one of [${names.join(", ")}]`);
}

async function request(path, init) {
  const requestedAt = new Date().toISOString();
  const url = `${targetBaseUrl}${path}`;
  const response = await fetch(url, init);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    requestedAt,
    url,
    status: response.status,
    text,
    json
  };
}

function responsePreview(response) {
  if (!response) {
    return null;
  }

  return {
    requestedAt: response.requestedAt,
    url: response.url,
    status: response.status,
    textSnippet: response.text.slice(0, 300)
  };
}

async function main() {
  const startedAt = Date.now();
  const assertions = [];
  let reasonCode = "";
  let reason = "";
  let delegatedMe = null;

  try {
    const delegatedToken = requireOneOfEnv(["DELEGATED_SMOKE_TOKEN", "AUTH_SMOKE_TOKEN"]);
    delegatedMe = await request("/v1/me", {
      method: "GET",
      headers: {
        authorization: `Bearer ${delegatedToken}`
      }
    });

    assertions.push({
      id: "auth-me-delegated-200",
      pass: delegatedMe.status === 200,
      details: `status=${delegatedMe.status}`
    });
    assertions.push({
      id: "auth-me-delegated-type",
      pass: delegatedMe.json?.caller?.tokenType === "delegated",
      details: `tokenType=${delegatedMe.json?.caller?.tokenType ?? "n/a"}`
    });
  } catch (error) {
    reasonCode = "DELEGATED_SMOKE_RUNTIME_ERROR";
    reason = error instanceof Error ? error.message : String(error);
    assertions.push({
      id: "delegated-smoke-runtime-error",
      pass: false,
      details: reason
    });
  }

  const failed = assertions.filter((assertion) => !assertion.pass);
  const status = failed.length === 0 ? "pass" : "fail";
  if (status === "fail" && !reasonCode) {
    reasonCode = "DELEGATED_SMOKE_ASSERTION_FAILED";
    reason = `Failed assertions: ${failed.map((assertion) => assertion.id).join(", ")}`;
  }

  const artifactPath = await writeDeployArtifact("delegated-smoke", {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha: getHeadSha(),
    status,
    reasonCode,
    reason,
    targetBaseUrl,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    responses: {
      delegatedMe: responsePreview(delegatedMe)
    },
    assertions
  });

  await appendGithubOutput({
    delegated_smoke_path: artifactPath,
    delegated_smoke_status: status
  });

  if (status !== "pass") {
    throw new Error(
      `Delegated smoke verification failed for ${targetBaseUrl}: ${reasonCode || "DELEGATED_SMOKE_ASSERTION_FAILED"}`
    );
  }
}

void main();
