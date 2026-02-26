# System Smoke

## Scope

`tests/system/` contains black-box system smoke checks used by acceptance and production verification paths.

This directory is intentionally different from the in-process commit smoke harness:

- `pnpm ci:smoke:system` runs `tests/commit/smoke.inproc.ts` (in-process app injection for commit/integration gates).
- `pnpm test:acceptance:system` runs `tests/system/smoke.ts` (black-box HTTP checks against a running target URL).

## Run Command

```bash
pnpm test:acceptance:system
```

Equivalent direct command:

```bash
tsx tests/system/smoke.ts
```

## Harness Behavior

`tests/system/smoke.ts`:

1. Resolves `BASE_URL` or `TARGET_API_BASE_URL` (defaults to `http://127.0.0.1:3001`).
2. Sends HTTP requests to `GET /health`, `GET /openapi.json`, and `GET /v1/ping`.
3. Verifies OpenAPI includes `/health` and `/v1/ping`.
4. Writes pass/fail artifact and appends `system_smoke_path` output when running in CI.

## Output Artifact

- `.artifacts/harness-smoke/<sha>/result.json`

Metadata defaults when env is unset:

- `HEAD_SHA=local`
- `TESTED_SHA=HEAD_SHA`
