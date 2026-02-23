# Branch Protection Baseline

Configure branch protection for `main` with one required status check:

- `risk-policy-gate`

Do not require dynamic checks directly (`ci-pipeline`, `browser-evidence`, `harness-smoke`, `migration-image-smoke`).

Those are tier-conditional and enforced by `risk-policy-gate` using `.github/policy/merge-policy.json`.

## Required Mainline Safety Controls

- Enforce admins (`main` has no admin bypass in normal flow).
- Require merge queue on `main`.
- Require `.github/workflows/merge-contract.yml` to run on `pull_request` and `merge_group`.
- Require PR-only integration into `main` (no direct pushes).
- Keep force-push and deletion blocked.
- Keep strict status checks enabled.

## Why one check

- Branch protection stays static and simple.
- Tier-specific required checks remain policy-driven.
- Stale SHA/tier evidence is rejected centrally.
- The same required gate context is used for PR and merge queue runs.

## Triage Notes

- `risk-policy-gate` artifacts include `reasonCodes` and `reasonDetails` for direct remediation.
- `docs-drift` artifacts include changed blocking paths, docs-critical paths, and expected doc targets.

## Verification Runbook

- `docs/runbooks/github-governance-verification.md`
