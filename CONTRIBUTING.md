# Contributing

Purpose: standard local workflow for the current build-once delivery model.

## Local Workflow

```bash
pnpm install
pnpm test
pnpm build
```

For integration-only runs:

```bash
pnpm --filter @compass/database run postgres:up
pnpm test:integration
pnpm --filter @compass/database run postgres:down
```

## Branching

- Keep commits small and reversible.
- Work on feature branches and open PRs to merge.
