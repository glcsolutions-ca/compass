# API Acceptance Smoke

Purpose: black-box API smoke checks for runtime health.

## Run

```bash
pnpm test:system
```

Set target endpoint via:

- `TARGET_API_BASE_URL` (preferred), or
- `BASE_URL`.

## Source Of Truth

- `tests/acceptance/api/system/smoke.ts`
