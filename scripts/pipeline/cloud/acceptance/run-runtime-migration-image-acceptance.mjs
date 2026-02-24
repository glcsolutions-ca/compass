import { requireEnv, writeJsonFile } from "../../shared/pipeline-utils.mjs";
import { requireReleasePackageRefs, runShell } from "./runtime-acceptance-lib.mjs";

async function main() {
  const headSha = requireEnv("HEAD_SHA");
  const acrName = requireEnv("ACR_NAME");
  const { apiRef } = requireReleasePackageRefs();
  const artifactPath = `.artifacts/migration-image-smoke/${headSha}/result.json`;

  try {
    await runShell(`
set -euo pipefail
artifact_dir=".artifacts/migration-image-smoke/${headSha}"
mkdir -p "$artifact_dir"

network_name="acceptance-migration-net"
postgres_name="acceptance-migration-postgres"
db_url="postgres://compass:compass@$postgres_name:5432/compass"

cleanup() {
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
    echo "Timed out waiting for postgres in migration-image acceptance" >&2
    exit 1
  fi
  sleep 1
done

docker run --rm \
  --network "$network_name" \
  -e DATABASE_URL="$db_url" \
  "${apiRef}" \
  node db/scripts/migrate.mjs up
`);

    await writeJsonFile(artifactPath, {
      schemaVersion: "1",
      generatedAt: new Date().toISOString(),
      headSha,
      status: "pass",
      reasonCode: "",
      releasePackageApiRef: apiRef
    });
  } catch (error) {
    await writeJsonFile(artifactPath, {
      schemaVersion: "1",
      generatedAt: new Date().toISOString(),
      headSha,
      status: "fail",
      reasonCode: "MIGRATION_IMAGE_SMOKE_FAILED",
      releasePackageApiRef: apiRef,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

void main();
