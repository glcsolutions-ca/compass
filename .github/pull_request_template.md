## Summary of Change

Describe what changed and where.

## Why This Change

Explain the problem and why this approach was chosen.

## Testing Evidence

List the commands you ran and any important outputs.

## Commit Stage Evidence (If Applicable)

- Scope kind:
- Commit scope artifact path:
- Docs-drift artifact path:
- Testing policy artifact path:
- Commit-stage gate artifact path:

## Baseline Checklist

- [ ] `pnpm check` passes locally.
- [ ] `pnpm build` passes locally.
- [ ] Naming and import conventions match the baseline.
- [ ] Contract artifacts are generated and committed when schemas change (`pnpm contract:check`).
- [ ] If control-plane files changed, pipeline docs were updated (`docs/commit-stage-policy.md` and `.github/workflows/README.md`).
- [ ] No unrelated files or generated noise are included.

## Risk and Rollback

- Risk level:
- Rollback plan:
