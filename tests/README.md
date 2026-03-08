# Testing

This repository uses a simpler product-first test taxonomy:

1. Unit tests beside the source they verify.
2. App-local integration tests beside the module they exercise.
3. Acceptance tests under `tests/acceptance/*`.
4. Pipeline tooling tests under `platform/pipeline`.

## Core Commands

```bash
pnpm test
pnpm test:integration
pnpm test:system
pnpm test:e2e
pnpm test:full
pnpm --filter @compass/pipeline-tools run test
```

## Directory Model

- colocated `*.test.ts(x)` files beside the source they verify in `apps/*/src` and `packages/*/src`.
- colocated `*.integration.test.ts` files beside the app module they exercise when real adapters are required.
- `tests/acceptance/api` for black-box API flows.
- `tests/acceptance/web` for browser/user journeys.
- `tests/acceptance/desktop` for desktop black-box workflows.

## Acceptance References

- `tests/acceptance/api/system/README.md`
- `tests/acceptance/web/e2e/README.md`
