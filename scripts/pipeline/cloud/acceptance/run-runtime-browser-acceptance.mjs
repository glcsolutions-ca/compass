import { requireEnv, writeJsonFile } from "../../shared/pipeline-utils.mjs";
import { requireReleasePackageRefs, runShell } from "./runtime-acceptance-lib.mjs";

async function main() {
  const headSha = requireEnv("HEAD_SHA");
  const testedSha = process.env.TESTED_SHA?.trim() || headSha;
  const acrName = requireEnv("ACR_NAME");
  const flowId = process.env.EVIDENCE_FLOW_ID?.trim() || "compass-smoke";
  const { apiRef, webRef } = requireReleasePackageRefs();
  if (!webRef) {
    throw new Error("RELEASE_PACKAGE_WEB_REF is required for browser acceptance");
  }

  const artifactPath = `.artifacts/runtime-browser/${headSha}/result.json`;

  try {
    await runShell(`
set -euo pipefail
artifact_dir=".artifacts/runtime-browser/${headSha}"
mkdir -p "$artifact_dir" ".artifacts/browser-evidence/${testedSha}"

network_name="acceptance-browser-net"
postgres_name="acceptance-browser-postgres"
api_container="acceptance-browser-api"
web_container="acceptance-browser-web"
db_url="postgres://compass:compass@$postgres_name:5432/compass"
tenant_id="acceptance-tenant"
delegated_client_id="web-client"
app_client_id="integration-client"
auth_issuer="https://compass.local/auth"
auth_audience="api://compass-api"
auth_secret="acceptance-local-jwt-secret-123456"
oauth_signing_secret="acceptance-oauth-signing-secret-123456"
auth_assignments='[{"tenantId":"acceptance-tenant","subjectType":"user","subjectId":"smoke-user","permissions":["profile.read"],"principalId":"principal-smoke-user"},{"tenantId":"acceptance-tenant","subjectType":"app","subjectId":"integration-client","permissions":["profile.read"],"principalId":"principal-smoke-app"}]'

cleanup() {
  docker rm -f "$web_container" >/dev/null 2>&1 || true
  docker rm -f "$api_container" >/dev/null 2>&1 || true
  docker rm -f "$postgres_name" >/dev/null 2>&1 || true
  docker network rm "$network_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

az acr login --name "${acrName}" --only-show-errors
docker pull "${apiRef}"
docker pull "${webRef}"

docker network create "$network_name"

docker run -d \
  --name "$postgres_name" \
  --network "$network_name" \
  -e POSTGRES_DB=compass \
  -e POSTGRES_USER=compass \
  -e POSTGRES_PASSWORD=compass \
  postgres:16-alpine

for i in $(seq 1 90); do
  if docker exec "$postgres_name" pg_isready -U compass -d compass >/dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 90 ]; then
    echo "Timed out waiting for postgres in browser acceptance" >&2
    exit 1
  fi
  sleep 1
done

docker run --rm \
  --network "$network_name" \
  -e DATABASE_URL="$db_url" \
  "${apiRef}" \
  node db/scripts/migrate.mjs up

docker run --rm \
  --network "$network_name" \
  -e DATABASE_URL="$db_url" \
  "${apiRef}" \
  node db/scripts/seed-postgres.mjs

docker run -d \
  --name "$api_container" \
  --network "$network_name" \
  -p 3001:3001 \
  -e DATABASE_URL="$db_url" \
  -e AUTH_ISSUER="$auth_issuer" \
  -e AUTH_AUDIENCE="$auth_audience" \
  -e AUTH_LOCAL_JWT_SECRET="$auth_secret" \
  -e AUTH_ACTIVE_TENANT_IDS="$tenant_id" \
  -e AUTH_ALLOWED_CLIENT_IDS="$delegated_client_id,$app_client_id" \
  -e AUTH_ALLOW_JIT_USERS=false \
  -e AUTH_ASSIGNMENTS_JSON="$auth_assignments" \
  -e OAUTH_TOKEN_SIGNING_SECRET="$oauth_signing_secret" \
  "${apiRef}"

for i in $(seq 1 90); do
  if curl --silent --fail http://127.0.0.1:3001/health >/dev/null; then
    break
  fi
  if [ "$i" -eq 90 ]; then
    echo "Timed out waiting for release package API readiness (browser path)" >&2
    echo "=== Capturing API logs ===" >&2
    docker logs "$api_container" >&2 || true
    exit 1
  fi
  sleep 1
done

docker run -d \
  --name "$web_container" \
  --network "$network_name" \
  -p 3000:3000 \
  -e API_BASE_URL="http://$api_container:3001" \
  "${webRef}"

for i in $(seq 1 90); do
  if curl --silent --fail http://127.0.0.1:3000 >/dev/null; then
    break
  fi
  if [ "$i" -eq 90 ]; then
    echo "Timed out waiting for release package Web readiness" >&2
    exit 1
  fi
  sleep 1
done

PR_NUMBER=0 \
WEB_BASE_URL=http://127.0.0.1:3000 \
EXPECTED_ENTRYPOINT=/ \
REQUIRED_FLOW_IDS_JSON="$(printf '[\"%s\"]' "${flowId}")" \
pnpm test:acceptance:browser
`);

    await writeJsonFile(artifactPath, {
      schemaVersion: "1",
      generatedAt: new Date().toISOString(),
      headSha,
      testedSha,
      status: "pass",
      evidenceFlowId: flowId,
      releasePackage: { apiRef, webRef }
    });
  } catch (error) {
    await writeJsonFile(artifactPath, {
      schemaVersion: "1",
      generatedAt: new Date().toISOString(),
      headSha,
      testedSha,
      status: "fail",
      evidenceFlowId: flowId,
      releasePackage: { apiRef, webRef },
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

void main();
