# GitHub Governance Verification

Use this checklist to verify repo governance controls stay aligned with the CI/CD contract.

## Prerequisite

Authenticate `gh` with repo admin access:

```bash
gh auth status
```

## 1) Main Branch Protection

```bash
gh api repos/glcsolutions-ca/compass/branches/main/protection \
  --jq '{enforce_admins,required_status_checks,required_pull_request_reviews,allow_force_pushes,allow_deletions}'
```

Expected:

- `enforce_admins.enabled=true`
- `required_status_checks.strict=true`
- required check context includes only `commit-stage-gate`
- `required_pull_request_reviews.required_approving_review_count=0`
- `allow_force_pushes.enabled=false`
- `allow_deletions.enabled=false`

## 2) Merge Method Policy

```bash
gh api repos/glcsolutions-ca/compass \
  --jq '{allow_squash_merge,allow_merge_commit,allow_rebase_merge,allow_auto_merge,delete_branch_on_merge}'
```

Expected:

- `allow_squash_merge=true`
- `allow_merge_commit=false`
- `allow_rebase_merge=false`
- `allow_auto_merge=true`
- `delete_branch_on_merge=true`

## 3) Merge Queue Enabled

```bash
gh api graphql -f query='
query {
  repository(owner:"glcsolutions-ca", name:"compass") {
    mergeQueue(branch:"main") { id }
  }
}' --jq '.data.repository.mergeQueue'
```

Expected:

- non-null `id` (queue is active on `main`)

## 4) Production Environment Safety

```bash
gh api repos/glcsolutions-ca/compass/environments/production \
  --jq '{name,can_admins_bypass,deployment_branch_policy,protection_rules}'
```

Expected:

- `can_admins_bypass=false`
- `deployment_branch_policy.protected_branches=true`
- branch-policy protection rule is present

## 5) Optional One-Shot Snapshot

```bash
echo 'branch protection'
gh api repos/glcsolutions-ca/compass/branches/main/protection \
  --jq '{enforce_admins,required_status_checks,required_pull_request_reviews,allow_force_pushes,allow_deletions}'
echo 'merge methods'
gh api repos/glcsolutions-ca/compass \
  --jq '{allow_squash_merge,allow_merge_commit,allow_rebase_merge,allow_auto_merge,delete_branch_on_merge}'
echo 'merge queue'
gh api graphql -f query='query { repository(owner:"glcsolutions-ca", name:"compass") { mergeQueue(branch:"main") { id } } }'
echo 'production environment'
gh api repos/glcsolutions-ca/compass/environments/production \
  --jq '{name,can_admins_bypass,deployment_branch_policy,protection_rules}'
```
