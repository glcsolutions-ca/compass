# Merge Policy Contract

This directory is the machine source of truth for merge control.

- Canonical contract: `.github/policy/merge-policy.json`
- Enforced by workflow: `.github/workflows/merge-contract.yml`
- Final required branch-protection check: `risk-policy-gate`

`risk-policy-gate` enforces tier-specific evidence, docs-drift, and stale SHA rules for the tested merge result.

## Control-Plane Coverage

`merge-policy.json` treats deploy and infra paths as high-risk control plane, including:

- `.github/workflows/**`
- `.github/policy/**`
- `scripts/ci/**`
- `scripts/deploy/**`
- `scripts/infra/**`
- `infra/azure/**`
- `infra/identity/**`
- `deploy/**`

## Trusted Review

Secret-backed Codex review is not part of the blocking PR merge contract.

- Use `.github/workflows/codex-review-trusted.yml` with manual `workflow_dispatch` for trusted-context review.
- Treat trusted review findings as advisory unless an explicit policy gate is added later.
