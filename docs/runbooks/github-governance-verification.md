# GitHub Governance Verification (Trunk-First)

Use this checklist to keep governance aligned with push-to-main commit-stage and integration-gate controls.

## Prerequisite

```bash
gh auth status
```

## 1) Main Branch Protection

```bash
gh api repos/glcsolutions-ca/compass/branches/main/protection \
  --jq '{enforce_admins,required_status_checks,allow_force_pushes,allow_deletions}'
```

Expected:

- `enforce_admins.enabled=true`
- `required_status_checks.strict=true`
- required contexts include `commit-stage` and `integration-gate`
- `allow_force_pushes.enabled=false`
- `allow_deletions.enabled=false`

If required contexts drift:

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

## 2) Required PR Review Gate Removed

```bash
gh api repos/glcsolutions-ca/compass/branches/main/protection \
  --jq '.required_pull_request_reviews'
```

Expected:

- `null`

If present, remove it:

```bash
gh api --method DELETE repos/glcsolutions-ca/compass/branches/main/protection/required_pull_request_reviews
```

## 3) Legacy Batching Ruleset Removed

```bash
gh api repos/glcsolutions-ca/compass/rulesets --paginate \
  --jq '.[] | {id,name,enforcement} | select(.name | test("batching"; "i"))'
```

Expected:

- no output

## 4) Production Environment Safety

```bash
gh api repos/glcsolutions-ca/compass/environments/production \
  --jq '{name,can_admins_bypass,deployment_branch_policy,protection_rules}'
```

Expected:

- `can_admins_bypass=false`
- `deployment_branch_policy.protected_branches=true`
- branch-policy protection rule is present

## 5) One-Shot Snapshot

```bash
echo 'branch protection'
gh api repos/glcsolutions-ca/compass/branches/main/protection \
  --jq '{enforce_admins,required_status_checks,required_pull_request_reviews,allow_force_pushes,allow_deletions}'
echo 'rulesets'
gh api repos/glcsolutions-ca/compass/rulesets --paginate \
  --jq '.[] | {id,name,enforcement}'
echo 'production environment'
gh api repos/glcsolutions-ca/compass/environments/production \
  --jq '{name,can_admins_bypass,deployment_branch_policy,protection_rules}'
```
