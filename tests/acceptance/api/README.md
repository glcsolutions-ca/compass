# API Acceptance

Purpose: black-box API acceptance that exercises a real authenticated thread lifecycle through the
public HTTP interface.

## Run

```bash
pnpm acceptance:api
```

The root command is self-sufficient. It will start the required local services when needed and
reuse a healthy `pnpm dev:up` stack if one is already running.

Set target endpoint via:

- `TARGET_API_BASE_URL` (preferred), or
- `BASE_URL`.

## Source of truth

- `tests/acceptance/api/thread-lifecycle.ts`

This suite is intentionally business-facing. It proves an authenticated user can work with threads
through the public HTTP interface without asserting internal implementation details.
