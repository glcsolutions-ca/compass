# Testing

This repository uses one strict taxonomy:

1. Unit tests beside the source they verify.
2. App-local integration tests beside the module they exercise.
3. Acceptance tests under `tests/acceptance/*`.
4. Pipeline tooling tests under `platform/pipeline`.

## Core commands

```bash
pnpm verify
pnpm acceptance
pnpm acceptance:api
pnpm acceptance:web
pnpm acceptance:desktop
pnpm --filter @compass/api test:integration
pnpm --filter @compass/pipeline-tools test
```

## Directory model

- colocated `*.test.ts(x)` files beside the source they verify in `apps/*/src` and `packages/*/src`
- colocated `*.integration.test.ts` files beside the app module they exercise when real adapters are required
- `tests/acceptance/api` for black-box API flows
- `tests/acceptance/web` for browser/user journeys
- `tests/acceptance/desktop` for desktop black-box workflows

## Acceptance references

- `tests/acceptance/api/README.md`
- `tests/acceptance/web/README.md`
