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
pnpm --filter @compass/api test:integration
pnpm --filter @compass/pipeline-tools test
```

Focused suite commands exist when you are working on one acceptance surface:

```bash
pnpm acceptance:api
pnpm acceptance:web
```

## Directory model

- colocated `*.test.ts(x)` files beside the source they verify in `apps/*/src` and `packages/*/src`
- colocated `*.integration.test.ts` files beside the app module they exercise when real adapters are required
- `tests/acceptance/api` for black-box API flows
- `tests/acceptance/web` for browser/user journeys
- `tests/baselines/web` for optional visual/layout baselines that are not part of the required CDP path

Desktop intentionally has no acceptance directory yet. We will only add one when desktop has a production-shaped release path and a real black-box suite.

Required acceptance suites are expected to run with zero skips. Optional coverage belongs outside
`tests/acceptance`.

## Acceptance references

- `tests/acceptance/api/README.md`
- `tests/acceptance/web/README.md`
