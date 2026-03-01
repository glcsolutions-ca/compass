# Agent Workflow Playbook

Canonical model: `../development-pipeline.md`.

## Local Loop

```bash
pnpm test:quick
pnpm test:full
pnpm build
```

`git commit` runs:

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
# or full repo
pnpm format
pnpm test:quick
```

For deployment-pipeline-config changes, also run:

```bash
pnpm ci:scope
pnpm ci:testing-policy
pnpm ci:docs-drift
pnpm ci:terminology-policy
pnpm ci:doc-quality
```

## High-Risk Paths

`HR001` blocks high-risk direct commits to `main` and routes them to PR + CODEOWNER review.
