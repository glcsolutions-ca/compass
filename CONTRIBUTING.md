# Contributing

Purpose: standard local workflow for the current build-once delivery model.

## Local Workflow

```bash
pnpm install
pnpm verify
pnpm acceptance
```

For integration-only runs:

```bash
pnpm --filter @compass/database run postgres:up
pnpm --filter @compass/api test:integration
pnpm --filter @compass/database run postgres:down
```

## Branching

- Keep commits small and reversible.
- Rebase onto `origin/main` before integration.
- Push directly to `main` when the change is small and low-risk, or open a PR when collaboration helps.
