# Codex Session Runtime

Purpose: local or cloud container runtime for agent session execution.

## Start Here

- runtime source: `apps/codex-session-runtime/src`
- local lifecycle helper: `scripts/dev/runtime-session.mjs`

## Run And Test

```bash
pnpm runtime:session:up
pnpm runtime:session:status
pnpm runtime:session:logs
pnpm runtime:session:down
```

## Source Of Truth

- `docs/runbooks/dynamic-sessions.md`
- `docs/architecture/dual-mode-agent-runtime.md`
