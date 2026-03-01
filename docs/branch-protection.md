# Branch Protection Baseline

Purpose: GitHub governance contract for trunk-based delivery.

## Required Contexts

- `commit-stage`
- `integration-gate`

## Required Protections

- enforce admins
- no force push
- no branch deletion
- no required PR review gate on `main`

## Verification

Use `docs/runbooks/github-governance-verification.md`.
