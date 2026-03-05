# Testing

This repository uses a stage-aligned test taxonomy:

1. Unit tests.
2. Integration tests (app-local integration behavior).
3. Acceptance tests (cross-service/system + browser).
4. Pipeline tooling tests.
5. Nonfunctional tests (performance/security scaffolds).

## Core Commands

```bash
pnpm test
pnpm test:integration
pnpm test:system
pnpm test:e2e
pnpm test:full
pnpm check
pnpm check:ci
pnpm --filter @compass/pipeline-tools run test
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
