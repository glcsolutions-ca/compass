# Contributing

Purpose: standard local workflow while the delivery pipeline is being rebuilt.

## Local Workflow

```bash
pnpm install
pnpm check
pnpm build
```

For integration-only runs:

```bash
pnpm --filter @compass/db-tools run postgres:up
pnpm test:integration
pnpm --filter @compass/db-tools run postgres:down
```

## Branching

- Keep commits small and reversible.
- Work on feature branches and open PRs to merge.
