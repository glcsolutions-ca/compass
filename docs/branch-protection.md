# Branch Protection Baseline

Configure branch protection for `main` with required status checks:

- `commit-stage`
- `integration-gate`

Do not require automated acceptance test gate or deployment stage checks directly. Those are post-merge stage gates.

## Apply or Repair via GitHub CLI

If required checks drift, reset the `main` required status checks to this baseline:

```bash
cat > /tmp/required-status-checks.json <<'JSON'
{
  "strict": true,
  "contexts": ["commit-stage", "integration-gate"]
}
JSON

gh api --method PATCH repos/glcsolutions-ca/compass/branches/main/protection/required_status_checks \
  --input /tmp/required-status-checks.json
```

## Integration Batching Ruleset Baseline

- Ruleset name: `Main Integration Batching`
- Rule: `merge_queue`
- `max_entries_to_merge`: `1`
- `grouping_strategy`: `ALLGREEN`

Use this to keep exact-merge debugging simple and recovery fast.

## Required Cloud Deployment Pipeline Safety Controls

- Enforce admins (`main` has no admin bypass in normal flow).
- Require integration batching (GitHub `merge_queue`) on `main`.
- Require `.github/workflows/commit-stage.yml` on `pull_request` + `merge_group`.
- Require `.github/workflows/integration-gate.yml` on `pull_request` + `merge_group`.
- Require `.github/workflows/cloud-deployment-pipeline.yml` on `push` to `main` for post-merge automated acceptance test gate/deployment stage gating.
- Require PR-only integration into `main` (no direct pushes).
- Keep force-push and deletion blocked.
- Keep strict status checks enabled.

## Why these checks

- `commit-stage` gives fast PR feedback.
- `integration-gate` validates the exact queued merge result.
- Cloud automated acceptance test gate/deployment stage remain decoupled as post-merge release-candidate gates.

## Triage notes

- `commit-stage` artifacts include `reasonCodes` and `reasonDetails` for direct remediation.
- `integration-gate` artifacts include exact-merge reason codes, check outcomes, and throughput timing.
- `docs-drift` artifacts include changed blocking paths, docs-critical paths, and expected doc targets.

## Verification runbook

- `docs/runbooks/github-governance-verification.md`
