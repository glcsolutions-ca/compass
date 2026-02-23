import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
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
  const tier = process.env.RISK_TIER ?? "high";

  const resultPath = path.join(".artifacts", "harness-smoke", testedSha, "result.json");
  const app = buildApiApp();

  try {
    await app.ready();

    const health = await app.inject({ method: "GET", url: "/health" });
    assert.equal(health.statusCode, 200, "health endpoint should return 200");

    const unauthenticated = await app.inject({
      method: "GET",
      url: "/api/v1/employees/employee-123/consolidated-view"
    });
    assert.equal(unauthenticated.statusCode, 401, "consolidated view should reject missing auth");

    const payload = {
      schemaVersion: "1",
      generatedAt: new Date().toISOString(),
      headSha,
      testedSha,
      tier,
      status: "pass",
      checks: [
        { id: "api-health", status: "pass" },
        { id: "auth-required", status: "pass" }
      ]
    };

    await writeResult(resultPath, payload);
    await appendGithubOutput({ harness_smoke_path: resultPath });
    console.info(`harness-smoke passed (${resultPath})`);
  } catch (error) {
    const payload = {
      schemaVersion: "1",
      generatedAt: new Date().toISOString(),
      headSha,
      testedSha,
      tier,
      status: "fail",
      checks: [
        {
          id: "harness-smoke",
          status: "fail",
          details: error instanceof Error ? error.message : String(error)
        }
      ]
    };

    await writeResult(resultPath, payload);
    await appendGithubOutput({ harness_smoke_path: resultPath });
    throw error;
  } finally {
    await app.close();
  }
}

void main();
