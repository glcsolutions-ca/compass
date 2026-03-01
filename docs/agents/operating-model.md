# Agent Operating Model

Canonical model: `../development-pipeline.md`.

## Defaults

1. Work in small, reversible commits.
2. Run `pnpm test:quick` while iterating.
3. Run `pnpm test:full` before push.
4. Treat CI gates as release evidence.
5. If `main` is red, fix forward or revert.
