import path from "node:path";
import { appendGithubOutput, requireEnv, writeJsonFile } from "../../shared/pipeline-utils.mjs";
import { createCcsError, withCcsGuardrail } from "../../shared/ccs-contract.mjs";

function normalizeHttpsBaseUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "https:") {
    throw new Error(`Desktop backend compatibility requires HTTPS base URL: ${rawUrl}`);
  }

  return parsed.toString().replace(/\/+$/, "");
}

async function fetchJsonWithStatus(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const contentType = String(response.headers.get("content-type") || "");
  const isJson = contentType.includes("application/json");
  const body = isJson ? await response.json() : null;
  return {
    status: response.status,
    ok: response.ok,
    body
  };
}

async function main() {
  const headSha = requireEnv("HEAD_SHA");
  const webBaseUrl = normalizeHttpsBaseUrl(requireEnv("WEB_BASE_URL"));
  const backendBaseUrl = normalizeHttpsBaseUrl(process.env.DESKTOP_BACKEND_BASE_URL || webBaseUrl);
  const artifactPath = path.join(
    ".artifacts",
    "desktop-acceptance",
    headSha,
    "backend-contract.json"
  );

  const reasons = [];
  const healthUrl = `${backendBaseUrl}/health`;
  const openapiUrl = `${backendBaseUrl}/openapi.json`;

  let health = null;
  let openapi = null;

  try {
    health = await fetchJsonWithStatus(healthUrl);
    if (health.status !== 200) {
      reasons.push(`health endpoint returned ${health.status}`);
    }
  } catch (error) {
    reasons.push(
      `health endpoint request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  try {
    openapi = await fetchJsonWithStatus(openapiUrl);
    if (openapi.status !== 200) {
      reasons.push(`openapi endpoint returned ${openapi.status}`);
    } else {
      const paths = openapi?.body?.paths;
      if (
        !paths ||
        typeof paths !== "object" ||
        !Object.prototype.hasOwnProperty.call(paths, "/health") ||
        !Object.prototype.hasOwnProperty.call(paths, "/v1/ping")
      ) {
        reasons.push("openapi contract missing required baseline paths");
      }
    }
  } catch (error) {
    reasons.push(
      `openapi endpoint request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const pass = reasons.length === 0;
  await writeJsonFile(artifactPath, {
    schemaVersion: "1",
    ccsVersion: "1",
    guardrailId: "desktop.backend-contract-acceptance",
    generatedAt: new Date().toISOString(),
    headSha,
    pass,
    webBaseUrl,
    backendBaseUrl,
    checks: {
      healthUrl,
      openapiUrl
    },
    reasonCodes: pass ? [] : ["DESKTOP_BACKEND_CONTRACT_NOT_PASS"],
    reasons
  });

  await appendGithubOutput({
    desktop_backend_contract_path: artifactPath,
    desktop_backend_contract_pass: String(pass)
  });

  if (!pass) {
    console.error("Desktop backend compatibility contract failed:");
    for (const reason of reasons) {
      console.error(`- ${reason}`);
    }
    throw createCcsError({
      code: "DESKTOP_BACKEND_CONTRACT_NOT_PASS",
      why: `Desktop backend compatibility contract failed (${reasons.length} reason(s)).`,
      fix: "Ensure health and OpenAPI contract checks pass for desktop backend URL.",
      doCommands: [
        `cat ${artifactPath}`,
        "verify WEB_BASE_URL / DESKTOP_BACKEND_BASE_URL and backend deployment health",
        "rerun desktop backend contract acceptance"
      ],
      ref: "docs/agents/troubleshooting.md#automated-acceptance-test-gate-failure"
    });
  }

  return { status: "pass", code: "DESKTOP_BACKEND_CONTRACT_PASS" };
}

void withCcsGuardrail({
  guardrailId: "desktop.backend-contract-acceptance",
  command:
    "node scripts/pipeline/desktop/automated-acceptance-test-gate/run-desktop-backend-contract-acceptance.mjs",
  passCode: "DESKTOP_BACKEND_CONTRACT_PASS",
  passRef: "docs/agents/troubleshooting.md#automated-acceptance-test-gate-failure",
  run: main,
  mapError: (error) => ({
    code: "CCS_UNEXPECTED_ERROR",
    why: error instanceof Error ? error.message : String(error),
    fix: "Resolve desktop backend contract runtime failures.",
    doCommands: [
      "node scripts/pipeline/desktop/automated-acceptance-test-gate/run-desktop-backend-contract-acceptance.mjs"
    ],
    ref: "docs/ccs.md#output-format"
  })
});
