# Contributing

Purpose: standard local workflow while the delivery pipeline is being rebuilt.

## Local Workflow

```bash
pnpm install
pnpm test:quick
pnpm build
```

If database work is involved:

```bash
pnpm db:postgres:up
pnpm test:integration
pnpm db:postgres:down
```

## Branching

- Keep commits small and reversible.
- Work on feature branches and open PRs to merge.
