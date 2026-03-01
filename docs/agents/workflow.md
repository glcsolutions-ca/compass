# Agent Workflow

Purpose: command-level local loop.

Canonical model: `../development-pipeline.md`.

## Local Loop

```bash
pnpm test:quick
pnpm test:full
pnpm build
```

Commit hook path:

```bash
pnpm exec lint-staged
pnpm test:quick
```

If `FULL001` appears:

```bash
pnpm db:postgres:up
pnpm test:full
pnpm db:postgres:down
```

If `FMT001` appears:

```bash
pnpm exec lint-staged
pnpm format
pnpm test:quick
```

For pipeline config changes:

```bash
pnpm ci:scope
pnpm ci:testing-policy
pnpm ci:docs-drift
pnpm ci:terminology-policy
pnpm ci:doc-quality
```
