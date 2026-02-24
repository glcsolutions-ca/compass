# Branch Protection Baseline

Configure branch protection for `main` with required status checks:

- `commit-stage`
- `merge-queue-gate`

Do not require acceptance or production checks directly. Those are post-merge stage gates.

## Apply or Repair via GitHub CLI

If required checks drift, reset the `main` required status checks to this baseline:

```bash
cat > /tmp/required-status-checks.json <<'JSON'
{
  "strict": true,
  "contexts": ["commit-stage", "merge-queue-gate"]
}
JSON

gh api --method PATCH repos/glcsolutions-ca/compass/branches/main/protection/required_status_checks \
  --input /tmp/required-status-checks.json
```

## Required Cloud Delivery Pipeline Safety Controls

- Enforce admins (`main` has no admin bypass in normal flow).
- Require merge queue on `main`.
- Require `.github/workflows/commit-stage.yml` on `pull_request` and emit `commit-stage` context on merge-group SHAs.
- Require `.github/workflows/merge-queue-gate.yml` on `merge_group`.
- Require `.github/workflows/cloud-delivery-pipeline.yml` on `push` to `main` for post-merge acceptance/production gating.
- Require PR-only integration into `main` (no direct pushes).
- Keep force-push and deletion blocked.
- Keep strict status checks enabled.

## Why these checks

- `commit-stage` gives fast PR feedback.
- `merge-queue-gate` validates the exact queued merge result.
- Cloud acceptance/production remain decoupled as post-merge release-package gates.

## Triage notes

- `commit-stage` artifacts include `reasonCodes` and `reasonDetails` for direct remediation.
- `merge-queue-gate` artifacts include exact-merge reason codes and check outcomes.
- `docs-drift` artifacts include changed blocking paths, docs-critical paths, and expected doc targets.

## Verification runbook

- `docs/runbooks/github-governance-verification.md`
