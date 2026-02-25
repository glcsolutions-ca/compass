import path from "node:path";
import { appendGithubOutput, requireEnv, writeJsonFile } from "../../shared/pipeline-utils.mjs";

function normalizeHttpsBaseUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "https:") {
    throw new Error(`Desktop backend compatibility requires HTTPS base URL: ${rawUrl}`);
  }

  const normalized = parsed.toString().replace(/\/+$/, "");
  return normalized;
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
  const artifactPath = path.join(
    ".artifacts",
    "desktop-acceptance",
    headSha,
    "backend-contract.json"
  );

  const reasons = [];
  const healthUrl = `${webBaseUrl}/api/v1/health`;
  const openapiUrl = `${webBaseUrl}/api/v1/openapi.json`;

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
        !Object.prototype.hasOwnProperty.call(paths, "/health")
      ) {
        reasons.push("openapi contract missing /health path");
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
    generatedAt: new Date().toISOString(),
    headSha,
    pass,
    webBaseUrl,
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
    process.exit(1);
  }
}

void main();
