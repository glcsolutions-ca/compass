import { requireEnv, writeJsonFile } from "../../shared/pipeline-utils.mjs";
import { requireCandidateRefs, runShell } from "./runtime-acceptance-lib.mjs";

async function main() {
  const headSha = requireEnv("HEAD_SHA");
  const testedSha = process.env.TESTED_SHA?.trim() || headSha;
  const acrName = requireEnv("ACR_NAME");
  const { apiRef, codexRef } = requireCandidateRefs();

  const artifactPath = `.artifacts/runtime-api-system/${headSha}/result.json`;

  try {
    await runShell(`
set -euo pipefail
artifact_dir=".artifacts/runtime-api-system/${headSha}"
mkdir -p "$artifact_dir" ".artifacts/deploy/${testedSha}" ".artifacts/harness-smoke/${testedSha}"

network_name="acceptance-api-system-net"
postgres_name="acceptance-api-system-postgres"
api_container="acceptance-api-system-api"
codex_container="acceptance-api-system-codex"
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
  docker rm -f "$codex_container" >/dev/null 2>&1 || true
  docker rm -f "$api_container" >/dev/null 2>&1 || true
  docker rm -f "$postgres_name" >/dev/null 2>&1 || true
  docker network rm "$network_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

az acr login --name "${acrName}" --only-show-errors
docker pull "${apiRef}"
if [ -n "${codexRef}" ]; then
  docker pull "${codexRef}"
fi

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
    echo "Timed out waiting for candidate API readiness" >&2
    exit 1
  fi
  sleep 1
done

smoke_tokens="$(ACCEPTANCE_AUTH_SECRET="$auth_secret" node --input-type=module - <<'NODE'
import { createHmac } from "node:crypto";

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signJwt(payload, secret) {
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const body = encodeJson(payload);
  const signature = createHmac("sha256", secret).update(header + "." + body).digest("base64url");
  return header + "." + body + "." + signature;
}

const secret = process.env.ACCEPTANCE_AUTH_SECRET;
if (!secret) {
  throw new Error("ACCEPTANCE_AUTH_SECRET is required");
}

const now = Math.floor(Date.now() / 1000);
const expiresAt = now + 900;
const tenantId = "acceptance-tenant";

const delegated = signJwt(
  {
    tid: tenantId,
    oid: "smoke-user",
    azp: "web-client",
    scp: "compass.user",
    iss: "https://compass.local/auth",
    aud: "api://compass-api",
    iat: now,
    nbf: now - 5,
    exp: expiresAt
  },
  secret
);

const app = signJwt(
  {
    tid: tenantId,
    azp: "integration-client",
    appid: "integration-client",
    idtyp: "app",
    roles: ["Compass.Integration.Read"],
    iss: "https://compass.local/auth",
    aud: "api://compass-api",
    iat: now,
    nbf: now - 5,
    exp: expiresAt
  },
  secret
);

console.log(delegated);
console.log(app);
NODE
)"; smoke_tokens="$(printf '%s\n' "$smoke_tokens" | paste -sd' ' -)"
read -r delegated_smoke_token app_smoke_token <<<"$smoke_tokens"
if [ -z "$delegated_smoke_token" ] || [ -z "$app_smoke_token" ]; then
  echo "Failed to generate acceptance smoke auth tokens" >&2
  exit 1
fi

BASE_URL=http://127.0.0.1:3001 \
AUTH_SMOKE_TOKEN="$delegated_smoke_token" \
APP_SMOKE_TOKEN="$app_smoke_token" \
pnpm acceptance:system-smoke

if [ -n "${codexRef}" ]; then
  docker run -d \
    --name "$codex_container" \
    --network "$network_name" \
    -p 3010:3010 \
    -e DATABASE_URL="$db_url" \
    -e CODEX_START_ON_BOOT=false \
    -e LOG_LEVEL=silent \
    "${codexRef}"

  for i in $(seq 1 120); do
    if curl --silent --fail http://127.0.0.1:3010/health >/dev/null; then
      break
    fi
    if [ "$i" -eq 120 ]; then
      echo "Timed out waiting for candidate codex gateway readiness" >&2
      exit 1
    fi
    sleep 1
  done

  CODEX_BASE_URL=http://127.0.0.1:3010 pnpm acceptance:codex-smoke
else
  mkdir -p ".artifacts/codex-smoke/${testedSha}"
  cat > ".artifacts/codex-smoke/${testedSha}/result.json" <<JSON
{
  "schemaVersion": "1",
  "generatedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "headSha": "${headSha}",
  "testedSha": "${testedSha}",
  "status": "not-required",
  "reasonCode": "CODEX_REF_MISSING"
}
JSON
fi
`);

    await writeJsonFile(artifactPath, {
      schemaVersion: "1",
      generatedAt: new Date().toISOString(),
      headSha,
      testedSha,
      status: "pass",
      candidate: { apiRef, codexRef }
    });
  } catch (error) {
    await writeJsonFile(artifactPath, {
      schemaVersion: "1",
      generatedAt: new Date().toISOString(),
      headSha,
      testedSha,
      status: "fail",
      candidate: { apiRef, codexRef },
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

void main();
