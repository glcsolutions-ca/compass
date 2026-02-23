# Troubleshooting

## `docs-drift` Failure

- Cause: docs-critical paths changed without doc target updates.
- Where it appears: `risk-policy-preflight`.
- Fix: update required docs (`docs/merge-policy.md`, `.github/workflows/README.md`, or matching targets in policy).

## `codex-review-trusted` Failure

- Cause: trusted review workflow failed to fetch PR diff data or review output failed validation.
- Fix: rerun `codex-review-trusted.yml` with the PR number only when you want supplemental trusted feedback; it is manual and non-blocking. Verify trusted workflow secrets/config are present.

## `risk-policy-gate` Failure

- Cause: required `needs.*.result` outcomes did not succeed, docs-drift was blocking, or browser-evidence assertions failed.
- Fix: rerun failed required checks on latest commit; for UI-required PRs verify manifest flow status, entrypoint, identity, and assertions for current `headSha` and `testedSha`.

## Stale Evidence After Push

- Any synchronize/push invalidates prior evidence. Rerun required checks for the new head SHA.
