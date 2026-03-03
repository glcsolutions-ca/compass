# Branch Protection Baseline

Purpose: GitHub governance contract for trunk-based delivery.

## Required Contexts

- `commit-stage`
- `acceptance-stage`

## Required Protections

- enforce admins
- no force push
- no branch deletion
- require pull request before merge to `main`
- require merge queue for `main`
- require review from Code Owners for owned paths
- allow direct push bypass only for emergency admins

## Verification

Use `docs/runbooks/github-governance-verification.md`.
