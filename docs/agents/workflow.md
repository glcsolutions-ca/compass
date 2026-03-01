# Agent Workflow

Purpose: command-level local loop.

Canonical model: `../development-pipeline.md`.

## Local Loop

```bash
pnpm test:quick
pnpm build
```

Before push (default):

```bash
pnpm test:quick
```

Run deeper suites when risk requires it:

```bash
pnpm test:integration
pnpm test:e2e
pnpm test:full
```

Hook path (enforced):

```bash
pnpm hooks:precommit
pnpm hooks:prepush
```

If `FULL001` appears while running `pnpm test:full`:

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
