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

- `.github/policy/pipeline-policy.json`
- `.github/workflows/commit-stage.yml`
- `.github/workflows/integration-gate.yml`
