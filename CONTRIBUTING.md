# Contributing

Purpose: standard local workflow for safe trunk integration.

## Start Here

- Read `README.md` for local setup.
- Read `docs/development-pipeline.md` for delivery rules.
- Read `AGENTS.md` for execution defaults.

## Local Workflow

```bash
pnpm install
pnpm test:quick
pnpm test:full
pnpm build
```

If database work is involved:

```bash
pnpm db:postgres:up
pnpm test:integration
pnpm db:postgres:down
```

## Commit And Push

- Keep commits small and reversible.
- Open a PR and let merge queue update `main`.
- Treat CI gate results as release evidence.
