import { requireEnv, writeJsonFile } from "../shared/pipeline-utils.mjs";
import { requireCandidateRefs, runShell } from "./runtime-acceptance-lib.mjs";

async function main() {
  const headSha = requireEnv("HEAD_SHA");
  const testedSha = process.env.TESTED_SHA?.trim() || headSha;
  const acrName = requireEnv("ACR_NAME");
  const { apiRef } = requireCandidateRefs();

  const artifactPath = `.artifacts/runtime-api-system/${headSha}/result.json`;

  try {
    await runShell(`
set -euo pipefail
artifact_dir=".artifacts/runtime-api-system/${headSha}"
mkdir -p "$artifact_dir" ".artifacts/deploy/${testedSha}" ".artifacts/harness-smoke/${testedSha}"

network_name="acceptance-api-system-net"
postgres_name="acceptance-api-system-postgres"
api_container="acceptance-api-system-api"
db_url="postgres://compass:compass@$postgres_name:5432/compass"

cleanup() {
  docker rm -f "$api_container" >/dev/null 2>&1 || true
  docker rm -f "$postgres_name" >/dev/null 2>&1 || true
  docker network rm "$network_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

az acr login --name "${acrName}" --only-show-errors
docker pull "${apiRef}"

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
    echo "Timed out waiting for postgres in API/system acceptance" >&2
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
    echo "Timed out waiting for candidate API readiness" >&2
    exit 1
  fi
  sleep 1
done

TARGET_API_BASE_URL=http://127.0.0.1:3001 pnpm deploy:smoke
BASE_URL=http://127.0.0.1:3001 pnpm acceptance:system-smoke
`);

    await writeJsonFile(artifactPath, {
      schemaVersion: "1",
      generatedAt: new Date().toISOString(),
      headSha,
      testedSha,
      status: "pass",
      candidate: { apiRef }
    });
  } catch (error) {
    await writeJsonFile(artifactPath, {
      schemaVersion: "1",
      generatedAt: new Date().toISOString(),
      headSha,
      testedSha,
      status: "fail",
      candidate: { apiRef },
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

void main();
