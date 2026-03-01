# Test Policy

Purpose: policy contract for test placement, hygiene, and runtime checks.

## Scope

- test layer placement rules
- focused test restrictions
- import boundary restrictions
- quarantine policy path

## Run

```bash
pnpm ci:testing-policy
pnpm test:quick
```

## Source Of Truth

- `tests/policy/test-policy.json`
- `scripts/pipeline/commit/check-testing-policy.mjs`
