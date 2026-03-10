import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseCliArgs, optionalOption } from "../../../shared/scripts/cli-utils.mjs";

async function writeResult(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function requestJson(url) {
  const response = await fetch(url, { method: "GET" });
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

export async function runApiSmoke({ baseUrl, outputDir, headSha = "local", testedSha = headSha }) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const resultPath = path.join(outputDir, "api-smoke-result.json");
  const assertions = [];

  try {
    const health = await requestJson(`${normalizedBaseUrl}/health`);
    assert.equal(health.status, 200, "health endpoint should return 200");
    assertions.push({ id: "health-200", pass: true, details: `status=${health.status}` });

    const openapi = await requestJson(`${normalizedBaseUrl}/openapi.json`);
    assert.equal(openapi.status, 200, "openapi endpoint should return 200");
    assertions.push({ id: "openapi-200", pass: true, details: `status=${openapi.status}` });

    const hasHealthPath = Boolean(openapi.json?.paths?.["/health"]);
    const hasPingPath = Boolean(openapi.json?.paths?.["/v1/ping"]);
    const hasAuthMePath = Boolean(openapi.json?.paths?.["/v1/auth/me"]);
    assert.equal(hasHealthPath, true, "openapi should include /health path");
    assert.equal(hasPingPath, true, "openapi should include /v1/ping path");
    assert.equal(hasAuthMePath, true, "openapi should include /v1/auth/me path");

    assertions.push({
      id: "openapi-has-health",
      pass: true,
      details: `hasHealthPath=${hasHealthPath}`
    });
    assertions.push({ id: "openapi-has-ping", pass: true, details: `hasPingPath=${hasPingPath}` });
    assertions.push({
      id: "openapi-has-auth-me",
      pass: true,
      details: `hasAuthMePath=${hasAuthMePath}`
    });

    const ping = await requestJson(`${normalizedBaseUrl}/v1/ping`);
    assert.equal(ping.status, 200, "ping endpoint should return 200");
    assert.equal(ping.json?.ok, true, "ping endpoint should report ok=true");
    assertions.push({ id: "ping-200", pass: true, details: `status=${ping.status}` });
    assertions.push({ id: "ping-ok", pass: true, details: JSON.stringify(ping.json) });

    const payload = {
      schemaVersion: "commit-api-smoke.v1",
      generatedAt: new Date().toISOString(),
      headSha,
      testedSha,
      baseUrl: normalizedBaseUrl,
      status: "pass",
      assertions
    };

    await writeResult(resultPath, payload);
    return payload;
  } catch (error) {
    const payload = {
      schemaVersion: "commit-api-smoke.v1",
      generatedAt: new Date().toISOString(),
      headSha,
      testedSha,
      baseUrl: normalizedBaseUrl,
      status: "fail",
      assertions,
      error: error instanceof Error ? error.message : String(error)
    };
    await writeResult(resultPath, payload);
    throw error;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const baseUrl =
    optionalOption(options, "base-url") ??
    process.env.BASE_URL ??
    process.env.TARGET_API_BASE_URL ??
    "http://127.0.0.1:3001";
  const outputDir = optionalOption(options, "out-dir") ?? path.resolve(".artifacts/commit-smoke");
  await runApiSmoke({
    baseUrl,
    outputDir,
    headSha: process.env.HEAD_SHA ?? "local",
    testedSha: process.env.TESTED_SHA ?? process.env.HEAD_SHA ?? "local"
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
