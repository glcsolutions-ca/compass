# Branch Protection Baseline

Configure branch protection for `main` with one required status check:

- `commit-stage-gate`

Do not require acceptance or production checks directly. Those are post-merge stage gates.

## Required Mainline Safety Controls

- Enforce admins (`main` has no admin bypass in normal flow).
- Require merge queue on `main`.
- Require `.github/workflows/commit-stage.yml` to run on `pull_request` and `merge_group`.
- Require PR-only integration into `main` (no direct pushes).
- Keep force-push and deletion blocked.
- Keep strict status checks enabled.

## Why one check

- Branch protection stays static and simple.
- Commit stage remains the single merge decision point.
- Acceptance/production stay decoupled as post-merge release-candidate gates.
- Merge queue and PR runs use the same required gate context.

## Triage notes

- `commit-stage-gate` artifacts include `reasonCodes` and `reasonDetails` for direct remediation.
- `docs-drift` artifacts include changed blocking paths, docs-critical paths, and expected doc targets.

## Verification runbook

- `docs/runbooks/github-governance-verification.md`
