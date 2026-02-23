import {
  appendGithubOutput,
  getHeadSha,
  getTier,
  requireEnv,
  writeDeployArtifact
} from "./utils.mjs";

const targetBaseUrl = requireEnv("TARGET_API_BASE_URL").replace(/\/$/, "");
const accessToken = requireEnv("ACCESS_TOKEN");
const expectedEmployeeId = process.env.EXPECTED_EMPLOYEE_ID?.trim() || "employee-123";
const requireEmployeeFound = process.env.REQUIRE_EMPLOYEE_FOUND?.trim() === "true";
const verifyShaHeader = process.env.VERIFY_SHA_HEADER?.trim() === "true";
const expectedSha = process.env.EXPECTED_SHA?.trim() || getHeadSha();
const authorizedRetryAttempts = Number(process.env.AUTHORIZED_RETRY_ATTEMPTS ?? 3);
const authorizedRetryDelayMs = Number(process.env.AUTHORIZED_RETRY_DELAY_MS ?? 5000);

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
    headers: response.headers,
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

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const startedAt = Date.now();
  const assertions = [];
  const authorizedTimeline = [];
  let reasonCode = "";
  let reason = "";
  let health = null;
  let unauthorized = null;
  let authorized = null;

  try {
    health = await request("/health", { method: "GET" });
    assertions.push({
      id: "health-200",
      pass: health.status === 200,
      details: `status=${health.status}`
    });

    unauthorized = await request(`/api/v1/employees/${expectedEmployeeId}/consolidated-view`, {
      method: "GET"
    });
    assertions.push({
      id: "protected-unauthorized-without-token",
      pass: unauthorized.status === 401,
      details: `status=${unauthorized.status}`
    });

    const attemptCount =
      Number.isFinite(authorizedRetryAttempts) && authorizedRetryAttempts > 0
        ? Math.floor(authorizedRetryAttempts)
        : 3;
    const delayMs =
      Number.isFinite(authorizedRetryDelayMs) && authorizedRetryDelayMs >= 0
        ? Math.floor(authorizedRetryDelayMs)
        : 5000;

    for (let attempt = 1; attempt <= attemptCount; attempt += 1) {
      const response = await request(`/api/v1/employees/${expectedEmployeeId}/consolidated-view`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      authorized = response;
      authorizedTimeline.push({
        attempt,
        at: new Date().toISOString(),
        status: response.status
      });

      if (response.status !== 401 || attempt === attemptCount) {
        break;
      }

      await sleep(delayMs);
    }

    const propagationAssertionPassed = authorizedTimeline.some(
      (entry) => entry.status !== 401 && entry.status !== 403
    );
    assertions.push({
      id: "authorized-propagation-window",
      pass: propagationAssertionPassed || (authorized?.status ?? 0) !== 401,
      details: `timeline=${authorizedTimeline.map((entry) => `${entry.attempt}:${entry.status}`).join(",")}`
    });

    const expectedAuthorizedStatuses = requireEmployeeFound ? [200] : [200, 404];
    assertions.push({
      id: "protected-authorized-status",
      pass: expectedAuthorizedStatuses.includes(authorized.status),
      details: `status=${authorized.status}, expected=${expectedAuthorizedStatuses.join("|")}`
    });

    if (authorized.status === 200) {
      const payloadEmployeeId = authorized?.json?.employeeId;
      assertions.push({
        id: "payload-employee-id",
        pass: payloadEmployeeId === expectedEmployeeId,
        details: `employeeId=${String(payloadEmployeeId)}`
      });

      assertions.push({
        id: "payload-freshness-lag",
        pass: Number.isFinite(authorized?.json?.freshnessLagSeconds),
        details: `freshnessLagSeconds=${String(authorized?.json?.freshnessLagSeconds)}`
      });

      assertions.push({
        id: "payload-source-systems-array",
        pass: Array.isArray(authorized?.json?.sourceSystems),
        details: `sourceSystemsType=${typeof authorized?.json?.sourceSystems}`
      });
    }

    if (authorized.status === 404 && !requireEmployeeFound) {
      assertions.push({
        id: "not-found-shape",
        pass:
          typeof authorized?.json?.statusCode === "number" ||
          typeof authorized?.json?.error === "string" ||
          authorized.text.length > 0,
        details: `statusCode=${String(authorized?.json?.statusCode)}, error=${String(authorized?.json?.error)}`
      });
    }

    if (verifyShaHeader) {
      const headerSha = authorized.headers.get("x-release-sha");
      assertions.push({
        id: "release-sha-header",
        pass: headerSha === expectedSha,
        details: `expected=${expectedSha}, actual=${headerSha}`
      });
    }
  } catch (error) {
    reasonCode = "API_SMOKE_RUNTIME_ERROR";
    reason = error instanceof Error ? error.message : String(error);
    assertions.push({
      id: "api-smoke-runtime-error",
      pass: false,
      details: reason
    });
  }

  const failed = assertions.filter((assertion) => !assertion.pass);
  const status = failed.length === 0 ? "pass" : "fail";
  if (status === "fail" && !reasonCode) {
    reasonCode = "API_SMOKE_ASSERTION_FAILED";
    reason = `Failed assertions: ${failed.map((assertion) => assertion.id).join(", ")}`;
  }

  const artifactPath = await writeDeployArtifact("api-smoke", {
    schemaVersion: "2",
    generatedAt: new Date().toISOString(),
    headSha: getHeadSha(),
    tier: getTier(),
    status,
    reasonCode,
    reason,
    targetBaseUrl,
    requireEmployeeFound,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    retry: {
      authorizedRetryAttempts,
      authorizedRetryDelayMs,
      timeline: authorizedTimeline
    },
    responses: {
      health: responsePreview(health),
      unauthorized: responsePreview(unauthorized),
      authorized: responsePreview(authorized)
    },
    assertions
  });

  await appendGithubOutput({
    api_smoke_path: artifactPath,
    api_smoke_status: status
  });

  if (status !== "pass") {
    throw new Error(
      `API smoke verification failed for ${targetBaseUrl}: ${reasonCode || "API_SMOKE_ASSERTION_FAILED"}`
    );
  }
}

void main();
