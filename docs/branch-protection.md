# Branch Protection Baseline (Trunk-First)

Configure `main` so direct integration is allowed, but safety checks remain strict.

## Required Status Contexts

- `commit-stage`
- `integration-gate`

Automated acceptance test gate and deployment stage checks remain post-push release controls, not branch-protection contexts.

## Required Safety Controls

- `enforce_admins.enabled=true`
- `required_status_checks.strict=true`
- `allow_force_pushes.enabled=false`
- `allow_deletions.enabled=false`
- no legacy batching ruleset on `main`
- no required PR review gate on `main`

## Apply or Repair via GitHub CLI

Set required status contexts:

```bash
cat >/tmp/required-status-checks.json <<'JSON'
{
  "strict": true,
  "contexts": ["commit-stage", "integration-gate"]
}
JSON

gh api --method PATCH repos/glcsolutions-ca/compass/branches/main/protection/required_status_checks \
  --input /tmp/required-status-checks.json
```

Remove required PR review gate:

```bash
gh api --method DELETE repos/glcsolutions-ca/compass/branches/main/protection/required_pull_request_reviews
```

## Why These Checks

- `commit-stage` gives fast fail-first commit-stage evidence on `main`.
- `integration-gate` validates integrated behavior on `main`.
- `main-red-recovery.yml` auto-reruns once, then auto-reverts repeated hard deterministic failures.

## Verification Runbook

- `docs/runbooks/github-governance-verification.md`
