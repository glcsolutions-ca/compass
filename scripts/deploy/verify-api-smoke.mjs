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

async function request(path, init) {
  const response = await fetch(`${targetBaseUrl}${path}`, init);
  const text = await response.text();

  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    status: response.status,
    headers: response.headers,
    text,
    json
  };
}

async function main() {
  const assertions = [];

  const health = await request("/health", { method: "GET" });
  assertions.push({
    id: "health-200",
    pass: health.status === 200,
    details: `status=${health.status}`
  });

  const unauthorized = await request(`/api/v1/employees/${expectedEmployeeId}/consolidated-view`, {
    method: "GET"
  });
  assertions.push({
    id: "protected-unauthorized-without-token",
    pass: unauthorized.status === 401,
    details: `status=${unauthorized.status}`
  });

  const authorized = await request(`/api/v1/employees/${expectedEmployeeId}/consolidated-view`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    }
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

  const failed = assertions.filter((assertion) => !assertion.pass);
  const status = failed.length === 0 ? "pass" : "fail";

  const artifactPath = await writeDeployArtifact("api-smoke", {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha: getHeadSha(),
    tier: getTier(),
    status,
    targetBaseUrl,
    requireEmployeeFound,
    assertions
  });

  await appendGithubOutput({
    api_smoke_path: artifactPath,
    api_smoke_status: status
  });

  if (status !== "pass") {
    throw new Error(`API smoke verification failed for ${targetBaseUrl}`);
  }
}

void main();
