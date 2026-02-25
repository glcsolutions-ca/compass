import { requireEnv, writeJsonFile } from "../../shared/pipeline-utils.mjs";
import { requireReleasePackageRefs, runShell } from "./runtime-acceptance-lib.mjs";

async function main() {
  const headSha = requireEnv("HEAD_SHA");
  const testedSha = process.env.TESTED_SHA?.trim() || headSha;
  const acrName = requireEnv("ACR_NAME");
  const { apiRef, codexRef, workerRef } = requireReleasePackageRefs();

  const artifactPath = `.artifacts/runtime-api-system/${headSha}/result.json`;

  try {
    await runShell(`
set -euo pipefail
artifact_dir=".artifacts/runtime-api-system/${headSha}"
mkdir -p "$artifact_dir" ".artifacts/harness-smoke/${testedSha}"

api_container="acceptance-api-system-api"

cleanup() {
  docker rm -f "$api_container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

az acr login --name "${acrName}" --only-show-errors
docker pull "${apiRef}"

docker run -d \
  --name "$api_container" \
  -p 3001:3001 \
  "${apiRef}"

for i in $(seq 1 90); do
  if curl --silent --fail http://127.0.0.1:3001/health >/dev/null; then
    break
  fi
  if [ "$i" -eq 90 ]; then
    echo "Timed out waiting for release candidate API readiness" >&2
    docker logs "$api_container" >&2 || true
    exit 1
  fi
  sleep 1
done

BASE_URL=http://127.0.0.1:3001 pnpm test:acceptance:system
`);

    await writeJsonFile(artifactPath, {
      schemaVersion: "1",
      generatedAt: new Date().toISOString(),
      headSha,
      testedSha,
      status: "pass",
      releaseCandidate: { apiRef, codexRef, workerRef }
    });
  } catch (error) {
    await writeJsonFile(artifactPath, {
      schemaVersion: "1",
      generatedAt: new Date().toISOString(),
      headSha,
      testedSha,
      status: "fail",
      releaseCandidate: { apiRef, codexRef, workerRef },
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

void main();
