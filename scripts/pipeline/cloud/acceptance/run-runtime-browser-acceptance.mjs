import { requireEnv, writeJsonFile } from "../../shared/pipeline-utils.mjs";
import { requireCandidateRefs, runShell } from "./runtime-acceptance-lib.mjs";

async function main() {
  const headSha = requireEnv("HEAD_SHA");
  const testedSha = process.env.TESTED_SHA?.trim() || headSha;
  const acrName = requireEnv("ACR_NAME");
  const flowId = process.env.EVIDENCE_FLOW_ID?.trim() || "compass-smoke";
  const { apiRef, webRef } = requireCandidateRefs();
  if (!webRef) {
    throw new Error("CANDIDATE_WEB_REF is required for browser acceptance");
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
  "${apiRef}"

for i in $(seq 1 90); do
  if curl --silent --fail http://127.0.0.1:3001/health >/dev/null; then
    break
  fi
  if [ "$i" -eq 90 ]; then
    echo "Timed out waiting for candidate API readiness (browser path)" >&2
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
    echo "Timed out waiting for candidate Web readiness" >&2
    exit 1
  fi
  sleep 1
done

PR_NUMBER=0 \
WEB_BASE_URL=http://127.0.0.1:3000 \
EXPECTED_ENTRYPOINT=/ \
REQUIRED_FLOW_IDS_JSON="$(printf '[\"%s\"]' "${flowId}")" \
pnpm acceptance:browser-evidence
`);

    await writeJsonFile(artifactPath, {
      schemaVersion: "1",
      generatedAt: new Date().toISOString(),
      headSha,
      testedSha,
      status: "pass",
      evidenceFlowId: flowId,
      candidate: { apiRef, webRef }
    });
  } catch (error) {
    await writeJsonFile(artifactPath, {
      schemaVersion: "1",
      generatedAt: new Date().toISOString(),
      headSha,
      testedSha,
      status: "fail",
      evidenceFlowId: flowId,
      candidate: { apiRef, webRef },
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

void main();
