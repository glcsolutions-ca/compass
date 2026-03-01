## Summary

What changed.

## Why

Why this approach was chosen.

## Testing

List commands and key outputs.

## Pipeline Evidence (if applicable)

- Change class:
- Scope artifact:
- Docs-drift artifact:
- Gate artifact:

## Checklist

- [ ] `pnpm test:quick` passes.
- [ ] `pnpm build` passes when required.
- [ ] Contract outputs are updated when schemas change (`pnpm contract:check`).
- [ ] Pipeline docs are updated when pipeline config changes (`docs/development-pipeline.md`, `docs/commit-stage-policy.md`, `.github/workflows/README.md`).
- [ ] No unrelated changes are included.

## Risk And Rollback

- Risk level:
- Rollback plan:
