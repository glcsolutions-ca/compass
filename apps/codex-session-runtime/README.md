# Codex Session Runtime

Purpose: local or cloud container runtime for agent session execution.

## Start Here

- runtime source: `apps/codex-session-runtime/src`
- local lifecycle helper: `scripts/dev/runtime-session.mjs`

## Run And Test

```bash
pnpm --filter @compass/codex-session-runtime run session:up
pnpm --filter @compass/codex-session-runtime run session:status
pnpm --filter @compass/codex-session-runtime run session:logs
pnpm --filter @compass/codex-session-runtime run session:down
```

## Source Of Truth

- `docs/runbooks/dynamic-sessions.md`
- `docs/architecture/dual-mode-agent-runtime.md`
