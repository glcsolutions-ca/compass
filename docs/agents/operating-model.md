# Agent Operating Model

Purpose: default behavior for autonomous changes.

Canonical model: `../development-pipeline.md`.

## Defaults

1. Keep commits small and reversible.
2. Run `pnpm test:quick` while iterating.
3. Run `pnpm test:quick` before push by default.
4. Run `pnpm test:integration`, `pnpm test:e2e`, or `pnpm test:full` when change risk is higher.
5. Treat CI gate outcomes as release evidence.
6. If `main` is red, fix forward or revert.
