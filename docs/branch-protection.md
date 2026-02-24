# Branch Protection Baseline

Configure branch protection for `main` with one required status check:

- `commit-stage`

Do not require acceptance or production checks directly. Those are post-merge stage gates.

## Apply or Repair via GitHub CLI

If required checks drift, reset the `main` required status checks to this baseline:

```bash
cat > /tmp/required-status-checks.json <<'JSON'
{
  "strict": true,
  "contexts": ["commit-stage"]
}
JSON

gh api --method PATCH repos/glcsolutions-ca/compass/branches/main/protection/required_status_checks \
  --input /tmp/required-status-checks.json
```

## Required Mainline Safety Controls

- Enforce admins (`main` has no admin bypass in normal flow).
- Require merge queue on `main`.
- Require `.github/workflows/commit-stage.yml` to run on `pull_request` and `merge_group`.
- Require `.github/workflows/mainline-pipeline.yml` to run on `push` to `main` for post-merge acceptance/production gating.
- Require PR-only integration into `main` (no direct pushes).
- Keep force-push and deletion blocked.
- Keep strict status checks enabled.

## Why one check

- Branch protection stays static and simple.
- Commit stage remains the single merge decision point.
- Acceptance/production stay decoupled as post-merge release-candidate gates.
- Merge queue and PR runs use the same required gate context.

## Triage notes

- `commit-stage` artifacts include `reasonCodes` and `reasonDetails` for direct remediation.
- `docs-drift` artifacts include changed blocking paths, docs-critical paths, and expected doc targets.

## Verification runbook

- `docs/runbooks/github-governance-verification.md`
