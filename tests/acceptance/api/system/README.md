# API Acceptance Smoke

Purpose: black-box API smoke checks for runtime health.

## Run

```bash
pnpm test:acceptance:api
```

The root command is self-sufficient. It will start the required local services when needed and
reuse a healthy `pnpm dev:up` stack if one is already running.

Set target endpoint via:

- `TARGET_API_BASE_URL` (preferred), or
- `BASE_URL`.

## Source Of Truth

- `tests/acceptance/api/system/smoke.ts`
