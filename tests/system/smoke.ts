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

async function requestJson(url: string) {
  const response = await fetch(url, { method: "GET" });
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
    const health = await requestJson(`${baseUrl}/health`);
    assert.equal(health.status, 200, "health endpoint should return 200");
    assertions.push({ id: "health-200", pass: true, details: `status=${health.status}` });

    const openapi = await requestJson(`${baseUrl}/openapi.json`);
    assert.equal(openapi.status, 200, "openapi endpoint should return 200");
    assertions.push({ id: "openapi-200", pass: true, details: `status=${openapi.status}` });

    const hasHealthPath = Boolean(
      (openapi.json as { paths?: Record<string, unknown> } | null)?.paths?.["/health"]
    );
    const hasPingPath = Boolean(
      (openapi.json as { paths?: Record<string, unknown> } | null)?.paths?.["/v1/ping"]
    );
    assert.equal(hasHealthPath, true, "openapi should include /health path");
    assert.equal(hasPingPath, true, "openapi should include /v1/ping path");

    assertions.push({
      id: "openapi-has-health",
      pass: true,
      details: `hasHealthPath=${hasHealthPath}`
    });
    assertions.push({ id: "openapi-has-ping", pass: true, details: `hasPingPath=${hasPingPath}` });

    const ping = await requestJson(`${baseUrl}/v1/ping`);
    assert.equal(ping.status, 200, "ping endpoint should return 200");
    assertions.push({ id: "ping-200", pass: true, details: `status=${ping.status}` });

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
