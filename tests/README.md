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
pnpm test:acceptance
pnpm test:acceptance:api
pnpm test:acceptance:web
pnpm test:full
pnpm --filter @compass/pipeline-tools run test
```

Primary workflow commands are self-sufficient:

- `pnpm test` stays fast and does not manage infrastructure.
- `pnpm test:integration` and `pnpm test:acceptance*` start what they need from a cold state.
- If `pnpm dev:up` is already running, those commands reuse it and leave it running.

## Directory Model

- colocated `*.test.ts(x)` files beside the source they verify in `apps/*/src` and `packages/*/src`.
- colocated `*.integration.test.ts` files beside the app module they exercise when real adapters are required.
- `tests/acceptance/api` for black-box API flows.
- `tests/acceptance/web` for browser/user journeys.
- `tests/acceptance/desktop` for desktop black-box workflows.

## Acceptance References

- `tests/acceptance/api/system/README.md`
- `tests/acceptance/web/e2e/README.md`
