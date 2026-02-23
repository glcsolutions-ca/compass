# System Smoke

## Scope

`tests/system/` contains in-process harness smoke checks used for high-risk merge gate evidence.

## Run Command

```bash
pnpm ci:harness-smoke
```

Equivalent direct command:

```bash
tsx tests/system/smoke.ts
```

## Harness Behavior

`tests/system/smoke.ts`:

1. Builds the API app in-process (`buildApiApp()`).
2. Waits for app readiness.
3. Injects requests to `GET /health` and `GET /openapi.json`.
4. Verifies OpenAPI includes `/health`.
5. Writes pass/fail artifact and appends `harness_smoke_path` output when running in CI.

## Output Artifact

- `.artifacts/harness-smoke/<sha>/result.json`

Metadata defaults when env is unset:

- `HEAD_SHA=local`
- `TESTED_SHA=HEAD_SHA`
- `RISK_TIER=high`
