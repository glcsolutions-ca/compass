import { requireEnv, writeJsonFile } from "../../shared/pipeline-utils.mjs";
import { requireReleasePackageRefs, runShell } from "./runtime-acceptance-lib.mjs";

async function main() {
  const headSha = requireEnv("HEAD_SHA");
  const testedSha = process.env.TESTED_SHA?.trim() || headSha;
  const acrName = requireEnv("ACR_NAME");
  const flowId = process.env.EVIDENCE_FLOW_ID?.trim() || "compass-smoke";
  const { apiRef, webRef, workerRef } = requireReleasePackageRefs();

  const artifactPath = `.artifacts/runtime-browser/${headSha}/result.json`;

  try {
    await runShell(`
set -euo pipefail
artifact_dir=".artifacts/runtime-browser/${headSha}"
mkdir -p "$artifact_dir" ".artifacts/browser-evidence/${testedSha}"

api_container="acceptance-browser-api"
web_container="acceptance-browser-web"
docker_network="acceptance-browser-network"

cleanup() {
  docker rm -f "$web_container" >/dev/null 2>&1 || true
  docker rm -f "$api_container" >/dev/null 2>&1 || true
  docker network rm "$docker_network" >/dev/null 2>&1 || true
}
trap cleanup EXIT

az acr login --name "${acrName}" --only-show-errors
docker pull "${apiRef}"
docker pull "${webRef}"
docker network create "$docker_network" >/dev/null

docker run -d \
  --name "$api_container" \
  --network "$docker_network" \
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

docker run -d \
  --name "$web_container" \
  --network "$docker_network" \
  -p 3000:3000 \
  -e API_BASE_URL="http://$api_container:3001" \
  "${webRef}"

for i in $(seq 1 90); do
  if curl --silent --fail http://127.0.0.1:3000 >/dev/null; then
    break
  fi
  if [ "$i" -eq 90 ]; then
    echo "Timed out waiting for release candidate Web readiness" >&2
    docker logs "$web_container" >&2 || true
    exit 1
  fi
  sleep 1
done

PR_NUMBER=0 \
WEB_BASE_URL=http://127.0.0.1:3000 \
EXPECTED_ENTRYPOINT=/ \
REQUIRED_FLOW_IDS_JSON="$(printf '[\"%s\"]' "${flowId}")" \
REQUIRE_AUTH_GATEWAY=true \
pnpm test:acceptance:browser
`);

    await writeJsonFile(artifactPath, {
      schemaVersion: "1",
      generatedAt: new Date().toISOString(),
      headSha,
      testedSha,
      status: "pass",
      evidenceFlowId: flowId,
      releaseCandidate: { apiRef, webRef, workerRef }
    });
  } catch (error) {
    await writeJsonFile(artifactPath, {
      schemaVersion: "1",
      generatedAt: new Date().toISOString(),
      headSha,
      testedSha,
      status: "fail",
      evidenceFlowId: flowId,
      releaseCandidate: { apiRef, webRef, workerRef },
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

void main();
