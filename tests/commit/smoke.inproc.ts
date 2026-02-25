import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import request from "supertest";
import { buildApiApp } from "../../apps/api/src/app.ts";

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

async function main() {
  const headSha = process.env.HEAD_SHA ?? "local";
  const testedSha = process.env.TESTED_SHA ?? headSha;

  const resultPath = path.join(".artifacts", "commit-smoke", testedSha, "result.json");
  const app = buildApiApp();

  try {
    const health = await request(app).get("/health");
    assert.equal(health.status, 200, "health endpoint should return 200");

    const openapi = await request(app).get("/openapi.json");
    assert.equal(openapi.status, 200, "openapi endpoint should return 200");
    assert.ok(openapi.body.paths?.["/health"], "openapi should include /health path");
    assert.ok(openapi.body.paths?.["/v1/ping"], "openapi should include /v1/ping path");

    const ping = await request(app).get("/v1/ping");
    assert.equal(ping.status, 200, "ping endpoint should return 200");

    const payload = {
      schemaVersion: "1",
      generatedAt: new Date().toISOString(),
      headSha,
      testedSha,
      status: "pass",
      checks: [
        { id: "api-health", status: "pass" },
        { id: "openapi-available", status: "pass" },
        { id: "api-ping", status: "pass" }
      ]
    };

    await writeResult(resultPath, payload);
    await appendGithubOutput({ commit_smoke_path: resultPath });
    console.info(`commit in-process smoke passed (${resultPath})`);
  } catch (error) {
    const payload = {
      schemaVersion: "1",
      generatedAt: new Date().toISOString(),
      headSha,
      testedSha,
      status: "fail",
      checks: [
        {
          id: "commit-inproc-smoke",
          status: "fail",
          details: error instanceof Error ? error.message : String(error)
        }
      ]
    };

    await writeResult(resultPath, payload);
    await appendGithubOutput({ commit_smoke_path: resultPath });
    throw error;
  }
}

void main();
