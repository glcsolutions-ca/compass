import { appendGithubOutput, getHeadSha, requireEnv, writeDeployArtifact } from "./utils.mjs";

const targetBaseUrl = requireEnv("TARGET_API_BASE_URL").replace(/\/$/, "");
const expectedEntraClientId = requireEnv("EXPECTED_ENTRA_CLIENT_ID").trim();
const expectedEntraRedirectUri = (
  process.env.EXPECTED_ENTRA_REDIRECT_URI?.trim() || `${targetBaseUrl}/v1/auth/entra/callback`
).replace(/\/$/, "");
const verifyShaHeader = process.env.VERIFY_SHA_HEADER?.trim() === "true";
const expectedSha = process.env.EXPECTED_SHA?.trim() || getHeadSha();
const apiSmokeSessionCookie = process.env.API_SMOKE_SESSION_COOKIE?.trim();

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
  let ping = null;
  let authMe = null;
  let authStart = null;

  try {
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
    const hasPingPath = Boolean(openapi?.json?.paths?.["/v1/ping"]);
    assertions.push({
      id: "openapi-includes-health",
      pass: hasHealthPath,
      details: `healthPath=${String(hasHealthPath)}`
    });
    assertions.push({
      id: "openapi-includes-ping",
      pass: hasPingPath,
      details: `pingPath=${String(hasPingPath)}`
    });

    ping = await request("/v1/ping", { method: "GET" });
    assertions.push({
      id: "ping-200",
      pass: ping.status === 200,
      details: `status=${ping.status}`
    });

    authMe = await request("/v1/auth/me", {
      method: "GET",
      headers: apiSmokeSessionCookie ? { cookie: apiSmokeSessionCookie } : undefined
    });
    assertions.push({
      id: "auth-me-status",
      pass: apiSmokeSessionCookie ? authMe.status === 200 : authMe.status === 401,
      details: `status=${authMe.status}, mode=${apiSmokeSessionCookie ? "authenticated" : "anonymous"}`
    });

    authStart = await request("/v1/auth/entra/start?returnTo=%2F", {
      method: "GET",
      redirect: "manual"
    });
    const authStartLocation = authStart.headers.get("location") ?? "";
    let authStartUrl = null;
    try {
      authStartUrl = authStartLocation ? new URL(authStartLocation) : null;
    } catch {
      authStartUrl = null;
    }
    const authStartRedirectStatus = authStart.status === 302 || authStart.status === 303;
    const authStartProviderRedirect = authStartUrl?.host === "login.microsoftonline.com";
    const authStartAuthorizePath =
      authStartUrl?.pathname.includes("/organizations/oauth2/v2.0/authorize") ?? false;
    const authStartRedirectUriMatches =
      authStartUrl?.searchParams.get("redirect_uri")?.replace(/\/$/, "") ===
      expectedEntraRedirectUri;
    const authStartClientIdMatches =
      authStartUrl?.searchParams.get("client_id") === expectedEntraClientId;
    assertions.push({
      id: "auth-start-redirect-status",
      pass: authStartRedirectStatus,
      details: `status=${authStart.status}`
    });
    assertions.push({
      id: "auth-start-provider-redirect",
      pass: authStartProviderRedirect,
      details: authStartLocation || "missing location header"
    });
    assertions.push({
      id: "auth-start-authorize-path",
      pass: authStartAuthorizePath,
      details: authStartUrl?.pathname ?? "invalid location header"
    });
    assertions.push({
      id: "auth-start-redirect-uri",
      pass: authStartRedirectUriMatches,
      details: `expected=${expectedEntraRedirectUri}, actual=${authStartUrl?.searchParams.get("redirect_uri") ?? "missing"}`
    });
    assertions.push({
      id: "auth-start-client-id",
      pass: authStartClientIdMatches,
      details: `expected=${expectedEntraClientId}, actual=${authStartUrl?.searchParams.get("client_id") ?? "missing"}`
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
      ping: responsePreview(ping),
      authMe: responsePreview(authMe),
      authStart: responsePreview(authStart)
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
