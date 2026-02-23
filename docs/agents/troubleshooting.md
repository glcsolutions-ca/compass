# Troubleshooting

## `docs-drift` Failure

- Cause: docs-critical paths changed without doc target updates.
- Where it appears: `risk-policy-preflight`.
- Fix: update required docs (`docs/merge-policy.md`, `.github/workflows/README.md`, or matching targets in policy).

## `codex-review` Failure

- Cause: actionable findings, report integrity failure, or missing `OPENAI_API_KEY` when review is required.
- Fix: address findings and rerun on current head SHA; if required review is enabled, ensure `OPENAI_API_KEY` is configured.

## `risk-policy-gate` Failure

- Cause: required check results did not succeed for current head SHA/tier, or browser-evidence assertions failed.
- Fix: rerun failed required checks on latest commit; for UI-required PRs verify manifest flow status, entrypoint, identity, and assertions.

## Stale Evidence After Push

- Any synchronize/push invalidates prior evidence. Rerun required checks for the new head SHA.
