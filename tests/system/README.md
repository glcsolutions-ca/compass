# System Smoke

## Scope

`tests/system/` contains black-box system smoke checks used by acceptance and production verification paths.

## Run Command

```bash
pnpm acceptance:system-smoke
```

Equivalent direct command:

```bash
tsx tests/system/smoke.ts
```

Codex gateway smoke:

```bash
pnpm acceptance:codex-smoke
```

Equivalent direct command:

```bash
tsx tests/system/codex-smoke.ts
```

## Harness Behavior

`tests/system/smoke.ts`:

1. Resolves `BASE_URL` or `TARGET_API_BASE_URL` (defaults to `http://127.0.0.1:3001`).
2. Sends HTTP requests to `GET /health` and `GET /openapi.json`.
3. Verifies OpenAPI includes `/health`.
4. Requires delegated token via `AUTH_SMOKE_TOKEN` and app token via `APP_SMOKE_TOKEN`.
5. Verifies delegated and app-authenticated `GET /v1/me` responses.
6. Verifies an invalid bearer token is rejected with `401`.
7. Writes pass/fail artifact and appends `system_smoke_path` output when running in CI.

`tests/system/codex-smoke.ts`:

1. Resolves `CODEX_BASE_URL` or `TARGET_CODEX_BASE_URL` (defaults to `http://127.0.0.1:3010`).
2. Sends HTTP requests to `GET /health` and `GET /v1/models`.
3. Validates `v1/models` returns either model payload (`200`) or auth error shape (`401`).
4. Opens and closes websocket `GET /v1/stream?threadId=codex_smoke_thread`.
5. Writes pass/fail artifact and appends `codex_smoke_path` output when running in CI.

## Output Artifact

- `.artifacts/harness-smoke/<sha>/result.json`
- `.artifacts/codex-smoke/<sha>/result.json`

Metadata defaults when env is unset:

- `HEAD_SHA=local`
- `TESTED_SHA=HEAD_SHA`
