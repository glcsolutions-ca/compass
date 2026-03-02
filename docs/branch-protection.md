# Branch Protection Baseline

Purpose: GitHub governance contract for trunk-based delivery.

## Required Contexts

- `commit-stage`
- `integration-gate`
- `staging-gate`

## Required Protections

- enforce admins
- no force push
- no branch deletion
- require pull request before merge to `main`
- require merge queue for `main`
- allow direct push only for emergency admins

## Verification

Use `docs/runbooks/github-governance-verification.md`.
