# GitHub Actions Config Cleanup

## Goal

Remove stale GitHub Actions variables/secrets while keeping release safety high.

## Active Workflow References

As of 2026-03-04, the three-stage workflows reference only:

- Vars: `ACA_API_APP_NAME`, `ACA_MIGRATE_JOB_NAME`, `ACA_WEB_APP_NAME`, `ACA_WORKER_APP_NAME`, `ACR_NAME`, `AZURE_RESOURCE_GROUP`, `AZURE_SUBSCRIPTION_ID`, `AZURE_TENANT_ID`, `PRODUCTION_API_BASE_URL`, `PRODUCTION_WEB_BASE_URL`
- Secrets: `AZURE_DEPLOY_CLIENT_ID`, `GITHUB_TOKEN`

## Pass A (Completed)

Removed clearly legacy smoke/evidence credentials that are no longer referenced by workflows or repo code.

Deleted from environments `acceptance` and `production`:

- Vars: `API_SMOKE_ALLOWED_TENANT_ID`, `API_SMOKE_DENIED_TENANT_ID`
- Secrets: `API_SMOKE_ALLOWED_CLIENT_ID`, `API_SMOKE_ALLOWED_CLIENT_SECRET`, `API_SMOKE_DENIED_CLIENT_ID`, `API_SMOKE_DENIED_CLIENT_SECRET`

## Pass B (After One Successful Post-Cleanup Release Cycle)

After one successful end-to-end `Commit -> Acceptance -> Release` cycle:

1. Recompute referenced vars/secrets from `.github/workflows/*.yml`.
2. Recompute current repo/environment vars/secrets.
3. Remove remaining unreferenced names in one controlled change.
4. Run one more full release cycle to confirm no hidden dependency.

Reference audit commands:

```bash
rg -o "vars\\.[A-Z0-9_]+" .github/workflows/*.yml | sed 's/.*vars\\.//' | sort -u
rg -o "secrets\\.[A-Z0-9_]+" .github/workflows/*.yml | sed 's/.*secrets\\.//' | sort -u
gh variable list --repo glcsolutions-ca/compass
gh secret list --repo glcsolutions-ca/compass
gh variable list --repo glcsolutions-ca/compass --env production
gh secret list --repo glcsolutions-ca/compass --env production
gh variable list --repo glcsolutions-ca/compass --env acceptance
gh secret list --repo glcsolutions-ca/compass --env acceptance
```
