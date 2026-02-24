import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { SignJWT } from "jose";
import { buildApiApp } from "../../apps/api/src/app.ts";
import { loadApiConfig } from "../../apps/api/src/config/index.ts";

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
  const config = loadApiConfig({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    AUTH_ACTIVE_TENANT_IDS: "commit-tenant",
    AUTH_ALLOWED_CLIENT_IDS: "commit-smoke-client",
    AUTH_ASSIGNMENTS_JSON:
      '[{"tenantId":"commit-tenant","subjectType":"user","subjectId":"commit-smoke-user","permissions":["profile.read"]}]'
  });
  const app = buildApiApp({ config });

  try {
    await app.ready();

    const health = await app.inject({ method: "GET", url: "/health" });
    assert.equal(health.statusCode, 200, "health endpoint should return 200");

    const openapi = await app.inject({ method: "GET", url: "/openapi.json" });
    assert.equal(openapi.statusCode, 200, "openapi endpoint should return 200");
    assert.ok(openapi.json().paths?.["/health"], "openapi should include /health path");

    if (!config.authLocalJwtSecret) {
      throw new Error("commit smoke requires AUTH_LOCAL_JWT_SECRET");
    }

    const token = await new SignJWT({
      tid: "commit-tenant",
      oid: "commit-smoke-user",
      azp: "commit-smoke-client",
      scp: "compass.user"
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(config.authIssuer)
      .setAudience(config.authAudience)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(config.authLocalJwtSecret));

    const me = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    assert.equal(me.statusCode, 200, "authenticated /v1/me endpoint should return 200");

    const payload = {
      schemaVersion: "1",
      generatedAt: new Date().toISOString(),
      headSha,
      testedSha,
      status: "pass",
      checks: [
        { id: "api-health", status: "pass" },
        { id: "openapi-available", status: "pass" },
        { id: "auth-path-me", status: "pass" }
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
  } finally {
    await app.close();
  }
}

void main();
