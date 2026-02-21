## Summary of Change

Describe what changed and where.

## Why This Change

Explain the problem and why this approach was chosen.

## Testing Evidence

List the commands you ran and any important outputs.

## Merge Contract Evidence (If Applicable)

- Tier from preflight:
- Preflight artifact path:
- Docs-drift artifact path:
- Codex-review artifact path:
- Browser-evidence manifest path (if required):
- Harness-smoke artifact path (if required):

## Baseline Checklist

- [ ] `pnpm check` passes locally.
- [ ] `pnpm build` passes locally.
- [ ] Naming and import conventions match the baseline.
- [ ] Contract artifacts are generated and committed when schemas change (`pnpm contract:check`).
- [ ] If control-plane files changed, merge docs were updated (`docs/merge-policy.md` and `.github/workflows/README.md`).
- [ ] No unrelated files or generated noise are included.

## Risk and Rollback

- Risk level:
- Rollback plan:
