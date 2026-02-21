# Troubleshooting

## `docs-drift` Failure

- Cause: Control-plane or docs-critical paths changed without doc target updates.
- Fix: Update required docs (`docs/merge-policy.md`, `.github/workflows/README.md`, or matching doc targets in policy).

## `codex-review` Failure

- Cause: Full review returned actionable findings for `t3`, or report integrity failed.
- Fix: Address findings and rerun on current head SHA.

## `risk-policy-gate` Failure

- Cause: Missing/stale/invalid artifacts or failed required checks for current head SHA/tier.
- Fix: Regenerate required evidence on latest commit and verify artifact paths.

## Stale Evidence After Push

- Any synchronize/push invalidates prior evidence. Rerun required checks for the new head SHA.
