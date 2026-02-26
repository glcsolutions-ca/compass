# GitHub Governance Verification (Trunk-First)

Use this checklist to keep governance aligned with push-to-main commit-stage and integration-gate controls.

## Prerequisite

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
- `required_status_checks=null` (direct pushes allowed)
- `required_pull_request_reviews=null`
- `allow_force_pushes.enabled=false`
- `allow_deletions.enabled=false`

If status checks are reintroduced and trunk-first pushes are blocked:

```bash
gh api --method DELETE repos/glcsolutions-ca/compass/branches/main/protection/required_status_checks
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

## 6) Phase 2 Readiness: High-Risk Path Ruleset

Local enforcement (`HR001`) is active now via `pnpm test:quick` and git hooks. GitHub path-scoped PR enforcement is deferred until Codex runs under a separate identity.

```bash
gh api repos/glcsolutions-ca/compass/rulesets --paginate \
  --jq '.[] | {id,name,enforcement,target} | select(.name | test("high[- ]risk|codeowner"; "i"))'
```

Expected now:

- no dedicated high-risk path ruleset yet

Target state for activation:

- ruleset targets `main`
- applies only to high-risk paths (`infra`, `identity`, `db/migrations`, `db/scripts`, `.github/workflows`, `.github/policy`, `scripts/pipeline`)
- requires pull request + code owner review + one approval
- requires approval from someone other than last pusher
