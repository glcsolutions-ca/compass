# System Smoke

Purpose: system-level smoke checks for runtime health.

## Run

```bash
pnpm test:system
```

Set target endpoint via:

- `TARGET_API_BASE_URL` (preferred), or
- `BASE_URL`.

## Source Of Truth

- `tests/acceptance/system/smoke.ts`
