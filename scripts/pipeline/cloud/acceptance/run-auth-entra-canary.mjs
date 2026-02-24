import assert from "node:assert/strict";
import path from "node:path";
import { appendGithubOutput, requireEnv, writeJsonFile } from "../shared/pipeline-utils.mjs";
import { fetchClientCredentialsToken } from "../shared/entra-token-utils.mjs";

async function requestJson(url, options = undefined) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json = null;
  try {
    json = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    status: response.status,
    json,
    textSnippet: text.slice(0, 300)
  };
}

async function main() {
  const headSha = process.env.HEAD_SHA?.trim() || process.env.GITHUB_SHA?.trim() || "local";
  const baseUrl = requireEnv("TARGET_API_BASE_URL").replace(/\/$/, "");
  const deniedExpectedCode =
    process.env.ENTRA_CANARY_DENIED_EXPECTED_CODE?.trim() || "assignment_denied";
  const artifactPath = path.join(".artifacts", "auth-canary", headSha, "result.json");
  const assertions = [];

  try {
    const appToken = await fetchClientCredentialsToken({
      tenantId: requireEnv("ENTRA_CANARY_ALLOWED_TENANT_ID"),
      clientId: requireEnv("ENTRA_CANARY_ALLOWED_CLIENT_ID"),
      clientSecret: requireEnv("ENTRA_CANARY_ALLOWED_CLIENT_SECRET"),
      scope: requireEnv("ENTRA_CANARY_APP_SCOPE")
    });

    const appMe = await requestJson(`${baseUrl}/v1/me`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${appToken}`
      }
    });
    assert.equal(appMe.status, 200, "app token should be accepted");
    const appType = appMe.json?.caller?.tokenType;
    assert.equal(appType, "app", "app token should classify as app");
    assertions.push({
      id: "app-me-200",
      pass: true,
      details: `status=${appMe.status}, tokenType=${appType}`
    });

    const invalidMe = await requestJson(`${baseUrl}/v1/me`, {
      method: "GET",
      headers: {
        authorization: "Bearer invalid.canary.token"
      }
    });
    assert.equal(invalidMe.status, 401, "invalid token should be rejected");
    assertions.push({
      id: "invalid-token-401",
      pass: true,
      details: `status=${invalidMe.status}`
    });

    const deniedToken = await fetchClientCredentialsToken({
      tenantId: requireEnv("ENTRA_CANARY_DENIED_TENANT_ID"),
      clientId: requireEnv("ENTRA_CANARY_DENIED_CLIENT_ID"),
      clientSecret: requireEnv("ENTRA_CANARY_DENIED_CLIENT_SECRET"),
      scope: requireEnv("ENTRA_CANARY_DENIED_APP_SCOPE")
    });

    const deniedMe = await requestJson(`${baseUrl}/v1/me`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${deniedToken}`
      }
    });
    assert.equal(deniedMe.status, 403, "disallowed token should be forbidden");
    assert.equal(
      deniedMe.json?.code,
      deniedExpectedCode,
      `disallowed token should return ${deniedExpectedCode}`
    );
    assertions.push({
      id: "denied-403",
      pass: true,
      details: `status=${deniedMe.status}, expected=${deniedExpectedCode}, code=${deniedMe.json?.code ?? "n/a"}`
    });

    await writeJsonFile(artifactPath, {
      schemaVersion: "2",
      generatedAt: new Date().toISOString(),
      headSha,
      status: "pass",
      baseUrl,
      assertions
    });
    await appendGithubOutput({
      auth_entra_canary_path: artifactPath
    });
  } catch (error) {
    await writeJsonFile(artifactPath, {
      schemaVersion: "2",
      generatedAt: new Date().toISOString(),
      headSha,
      status: "fail",
      baseUrl,
      assertions,
      error: error instanceof Error ? error.message : String(error)
    });
    await appendGithubOutput({
      auth_entra_canary_path: artifactPath
    });
    throw error;
  }
}

void main();
