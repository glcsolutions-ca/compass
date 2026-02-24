import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

async function appendGithubOutput(values: Record<string, string>) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  await writeFile(outputPath, `${lines.join("\n")}\n`, { encoding: "utf8", flag: "a" });
}

async function writeResult(filePath: string, payload: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function requestJson(url: string, headers?: HeadersInit) {
  const response = await fetch(url, { method: "GET", headers });
  const text = await response.text();
  let json: unknown = null;
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
  const headSha = process.env.HEAD_SHA ?? "local";
  const testedSha = process.env.TESTED_SHA ?? headSha;
  const baseUrl = (
    process.env.BASE_URL ??
    process.env.TARGET_API_BASE_URL ??
    "http://127.0.0.1:3001"
  ).replace(/\/$/, "");

  const resultPath = path.join(".artifacts", "harness-smoke", testedSha, "result.json");
  const assertions: Array<{ id: string; pass: boolean; details: string }> = [];

  try {
    const delegatedAuthToken = process.env.AUTH_SMOKE_TOKEN?.trim();
    const appAuthToken = process.env.APP_SMOKE_TOKEN?.trim();
    assert.ok(delegatedAuthToken, "AUTH_SMOKE_TOKEN is required for system smoke");
    assert.ok(appAuthToken, "APP_SMOKE_TOKEN is required for system smoke");

    const health = await requestJson(`${baseUrl}/health`);
    assert.equal(health.status, 200, "health endpoint should return 200");
    assertions.push({ id: "health-200", pass: true, details: `status=${health.status}` });

    const openapi = await requestJson(`${baseUrl}/openapi.json`);
    assert.equal(openapi.status, 200, "openapi endpoint should return 200");
    assertions.push({ id: "openapi-200", pass: true, details: `status=${openapi.status}` });

    const hasHealthPath = Boolean(
      (openapi.json as { paths?: Record<string, unknown> } | null)?.paths?.["/health"]
    );
    assert.equal(hasHealthPath, true, "openapi should include /health path");
    assertions.push({
      id: "openapi-has-health",
      pass: true,
      details: `hasHealthPath=${hasHealthPath}`
    });

    const delegatedMe = await requestJson(`${baseUrl}/v1/me`, {
      authorization: `Bearer ${delegatedAuthToken}`
    });
    assert.equal(delegatedMe.status, 200, "delegated auth /v1/me endpoint should return 200");
    const delegatedTokenType =
      (delegatedMe.json as { caller?: { tokenType?: string } } | null)?.caller?.tokenType ?? "n/a";
    assert.equal(
      delegatedTokenType,
      "delegated",
      "delegated smoke token should classify as delegated"
    );
    assertions.push({
      id: "auth-me-delegated-200",
      pass: true,
      details: `status=${delegatedMe.status}, tokenType=${delegatedTokenType}`
    });

    const appMe = await requestJson(`${baseUrl}/v1/me`, {
      authorization: `Bearer ${appAuthToken}`
    });
    assert.equal(appMe.status, 200, "app auth /v1/me endpoint should return 200");
    const appTokenType =
      (appMe.json as { caller?: { tokenType?: string } } | null)?.caller?.tokenType ?? "n/a";
    assert.equal(appTokenType, "app", "app smoke token should classify as app");
    assertions.push({
      id: "auth-me-app-200",
      pass: true,
      details: `status=${appMe.status}, tokenType=${appTokenType}`
    });

    const deny = await requestJson(`${baseUrl}/v1/me`, {
      authorization: "Bearer invalid.smoke.token"
    });
    assert.equal(deny.status, 401, "invalid bearer token should be rejected");
    assertions.push({
      id: "auth-deny-invalid-token-401",
      pass: true,
      details: `status=${deny.status}`
    });

    const payload = {
      schemaVersion: "1",
      generatedAt: new Date().toISOString(),
      headSha,
      testedSha,
      baseUrl,
      status: "pass",
      assertions
    };

    await writeResult(resultPath, payload);
    await appendGithubOutput({ system_smoke_path: resultPath });
    console.info(`system black-box smoke passed (${resultPath})`);
  } catch (error) {
    const payload = {
      schemaVersion: "1",
      generatedAt: new Date().toISOString(),
      headSha,
      testedSha,
      baseUrl,
      status: "fail",
      assertions,
      error: error instanceof Error ? error.message : String(error)
    };

    await writeResult(resultPath, payload);
    await appendGithubOutput({ system_smoke_path: resultPath });
    throw error;
  }
}

void main();
