import { appendGithubOutput, getHeadSha, requireEnv, writeDeployArtifact } from "./utils.mjs";
import { fetchClientCredentialsToken } from "../../shared/entra-token-utils.mjs";

const targetBaseUrl = requireEnv("TARGET_API_BASE_URL").replace(/\/$/, "");
const verifyShaHeader = process.env.VERIFY_SHA_HEADER?.trim() === "true";
const expectedSha = process.env.EXPECTED_SHA?.trim() || getHeadSha();
const deniedExpectedCode = "assignment_denied";
const apiScope = `${requireEnv("API_IDENTIFIER_URI")}/.default`;

function requireClientCredentials({ tenantIdEnv, clientIdEnv, clientSecretEnv }) {
  return {
    tenantId: requireEnv(tenantIdEnv),
    clientId: requireEnv(clientIdEnv),
    clientSecret: requireEnv(clientSecretEnv),
    scope: apiScope
  };
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

async function main() {
  const startedAt = Date.now();
  const assertions = [];
  let reasonCode = "";
  let reason = "";
  let health = null;
  let openapi = null;
  let appMe = null;
  let deniedMe = null;
  let invalidMe = null;

  try {
    const allowedClient = requireClientCredentials({
      tenantIdEnv: "API_SMOKE_ALLOWED_TENANT_ID",
      clientIdEnv: "API_SMOKE_ALLOWED_CLIENT_ID",
      clientSecretEnv: "API_SMOKE_ALLOWED_CLIENT_SECRET"
    });
    const deniedClient = requireClientCredentials({
      tenantIdEnv: "API_SMOKE_DENIED_TENANT_ID",
      clientIdEnv: "API_SMOKE_DENIED_CLIENT_ID",
      clientSecretEnv: "API_SMOKE_DENIED_CLIENT_SECRET"
    });
    const appAuthSmokeToken = await fetchClientCredentialsToken(allowedClient);
    const deniedToken = await fetchClientCredentialsToken(deniedClient);

    health = await request("/health", { method: "GET" });
    assertions.push({
      id: "health-200",
      pass: health.status === 200,
      details: `status=${health.status}`
    });

    openapi = await request("/openapi.json", { method: "GET" });
    assertions.push({
      id: "openapi-200",
      pass: openapi.status === 200,
      details: `status=${openapi.status}`
    });

    const hasHealthPath = Boolean(openapi?.json?.paths?.["/health"]);
    assertions.push({
      id: "openapi-includes-health",
      pass: hasHealthPath,
      details: `healthPath=${String(hasHealthPath)}`
    });

    appMe = await request("/v1/me", {
      method: "GET",
      headers: {
        authorization: `Bearer ${appAuthSmokeToken}`
      }
    });
    assertions.push({
      id: "auth-me-app-200",
      pass: appMe.status === 200,
      details: `status=${appMe.status}`
    });
    assertions.push({
      id: "auth-me-app-type",
      pass: appMe.json?.caller?.tokenType === "app",
      details: `tokenType=${appMe.json?.caller?.tokenType ?? "n/a"}`
    });

    deniedMe = await request("/v1/me", {
      method: "GET",
      headers: {
        authorization: `Bearer ${deniedToken}`
      }
    });
    assertions.push({
      id: "auth-me-denied-403",
      pass: deniedMe.status === 403,
      details: `status=${deniedMe.status}`
    });
    assertions.push({
      id: "auth-me-denied-code",
      pass: deniedMe.json?.code === deniedExpectedCode,
      details: `expected=${deniedExpectedCode}, actual=${deniedMe.json?.code ?? "n/a"}`
    });

    invalidMe = await request("/v1/me", {
      method: "GET",
      headers: {
        authorization: "Bearer invalid.smoke.token"
      }
    });
    assertions.push({
      id: "auth-me-invalid-401",
      pass: invalidMe.status === 401,
      details: `status=${invalidMe.status}`
    });

    if (verifyShaHeader) {
      const headerSha = health.headers.get("x-release-sha") ?? openapi.headers.get("x-release-sha");
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
    status,
    reasonCode,
    reason,
    targetBaseUrl,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    responses: {
      health: responsePreview(health),
      openapi: responsePreview(openapi),
      appMe: responsePreview(appMe),
      deniedMe: responsePreview(deniedMe),
      invalidMe: responsePreview(invalidMe)
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
