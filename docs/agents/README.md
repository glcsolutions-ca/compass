# Agent Docs

Purpose: execution defaults and troubleshooting for coding agents.

Canonical model: `../development-pipeline.md`.

## Start Here

- `operating-model.md`
- `workflow.md`
- `troubleshooting.md`

## Fast Path

- iterate: `pnpm test:quick`
- before push (default): `pnpm test:quick`
- risk-based depth: `pnpm test:integration`, `pnpm test:e2e`, or `pnpm test:full`
- install hooks: `pnpm hooks:install`

## Source Of Truth

- `docs/development-pipeline.md`
- `.github/workflows/commit-stage.yml`
- `.github/workflows/acceptance-stage.yml`
