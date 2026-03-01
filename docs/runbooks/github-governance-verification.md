# GitHub Governance Verification Runbook

Purpose: verify branch protection and ruleset governance for trunk-based delivery.

## When To Use

- governance setup
- periodic audit
- after ruleset changes

## Inputs

- GitHub CLI auth to target repo

## Steps

1. Check main branch protection settings.
2. Confirm required status contexts align with policy.
3. Confirm force-push and deletion protections.
4. Confirm no conflicting batching/PR rules on `main`.

Useful checks:

```bash
gh api repos/glcsolutions-ca/compass/branches/main/protection
gh api repos/glcsolutions-ca/compass/rulesets --paginate
```

## Verify

- governance matches `docs/branch-protection.md`
- required contexts match policy/workflows

## Failure Handling

- repair branch protection/rulesets
- re-run verification commands
