# Agent Operating Model

Purpose: default behavior for autonomous changes.

Canonical model: `../development-pipeline.md`.

## Defaults

1. Keep commits small and reversible.
2. Run `pnpm test:quick` while iterating.
3. Run `pnpm test:full` before push.
4. Treat CI gate outcomes as release evidence.
5. If `main` is red, fix forward or revert.
