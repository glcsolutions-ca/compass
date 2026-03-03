# Testing

This repository uses a stage-aligned test taxonomy:

1. Commit-stage candidate tests (fast, releasable unit only).
2. Acceptance tests (cross-service/system + browser).
3. Integration tests (app-local integration behavior).
4. Nonfunctional tests (performance/security scaffolds).

## Core Commands

```bash
pnpm test:commit:candidate
pnpm test:commit:pipeline
pnpm test:commit:analysis
pnpm test:quick
pnpm test:integration
pnpm test:acceptance:system
pnpm test:acceptance:browser
pnpm test:full
```

## Directory Model

- `apps/<app>/test/unit` for app-owned unit tests.
- `apps/web/test/component` for UI component tests.
- `apps/<app>/test/integration` for app-owned integration suites.
- `tests/acceptance/system` for cross-service system flows.
- `tests/acceptance/e2e` for browser/user journeys.
- `tests/nonfunctional/*` for optional later-stage suites.

## Acceptance References

- `tests/acceptance/system/README.md`
- `tests/acceptance/e2e/README.md`
