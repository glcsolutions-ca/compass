# Troubleshooting

## `docs-drift` Failure

- Cause: Control-plane or docs-critical paths changed without doc target updates.
- Where it appears: `risk-policy-preflight` job.
- Fix: Update required docs (`docs/merge-policy.md`, `.github/workflows/README.md`, or matching doc targets in policy).

## `codex-review` Failure

- Cause: Full review returned actionable findings for `t3`, or report integrity failed.
- Fix: Address findings and rerun on current head SHA.

## `risk-policy-gate` Failure

- Cause: Required check-runs did not succeed for current head SHA/tier, or browser-evidence manifest assertions failed for required flows.
- Fix: Rerun failed required checks on the latest commit; for UI-required PRs, verify browser manifest flow status, entrypoint, identity, and assertions.

## Stale Evidence After Push

- Any synchronize/push invalidates prior evidence. Rerun required checks for the new head SHA.
