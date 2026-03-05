# Release and Rollback Runbook

## Purpose

Release Stage promotes an accepted candidate to production without rebuilding.

Workflow: `.github/workflows/03-release-stage.yml`.

## Hardening Notes

1. Workflow actions are SHA-pinned and updated by Dependabot.
2. Release intentionally avoids `pnpm` cache in this privileged stage.
3. Production environment deployment branch policy is `main` only.

## Release Rules

1. Automatic release trigger is successful Acceptance Stage completion.
2. Manual rollback/redeploy trigger is `workflow_dispatch` with `candidate_id`.
3. Auto mode resolves candidate identity from triggering `workflow_run.head_sha` and canonical GHCR manifest.
4. Stale candidates whose source revision is not on `main` are skipped.
5. Candidate manifest must validate before deploy.
6. Acceptance attestation must exist for candidate subject and `verdict=pass` (verified with `gh attestation verify` plus candidate/business-rule checks).
7. Production deploy uses exact candidate artifacts from GHCR.
8. Release resolves blue/green slot state, deploys candidate to the inactive slot label (`blue|green`) at `0%` traffic, then runs inactive-slot smoke checks.
9. Release promotes by switching label traffic to `inactive=100 active=0` for both API and Web.
10. Post-promotion production smoke checks must pass.
11. On post-promotion smoke failure, release attempts automatic rollback by flipping traffic back to the previous active label.
12. Release records GitHub deployment status and release attestation.

## Rollback Rules

1. Rollback means redeploying a previously accepted candidate.
2. Rollback uses label traffic reversal first (fast path), then candidate redeploy only if needed.
3. No source rebuild is allowed for rollback.

## Blue/Green Slot Baseline

1. Release labels are `blue` and `green`.
2. Release resolves the currently active label from API/Web traffic weights.
3. If labels are missing, release bootstraps baseline labels by assigning the active label to the currently serving revision and enforcing `active=100`.
4. Candidate deploy always targets the inactive label before promotion.

## Entra Redirect URI Checklist

1. Ensure Terraform `web_containerapp_fqdn` is set in `infra/identity/env/prod.tfvars`.
2. Apply `infra/identity` before enabling production blue/green release.
3. Confirm Entra web app redirect URIs include both:
   - `https://<web_app_name>---blue.<containerapps_env_domain>/v1/auth/entra/callback`
   - `https://<web_app_name>---green.<containerapps_env_domain>/v1/auth/entra/callback`
4. Keep production custom-domain callback URI configured as well.
5. If SSO smoke fails with `AADSTS50011`, verify redirect URI list first.

## Manual Promotion / Rollback Commands

```bash
# Promote inactive slot to active (example: promote green)
az containerapp ingress traffic set \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$ACA_API_APP_NAME" \
  --label-weight green=100 blue=0
az containerapp ingress traffic set \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$ACA_WEB_APP_NAME" \
  --label-weight green=100 blue=0

# Roll back to prior active slot (example: restore blue)
az containerapp ingress traffic set \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$ACA_API_APP_NAME" \
  --label-weight blue=100 green=0
az containerapp ingress traffic set \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$ACA_WEB_APP_NAME" \
  --label-weight blue=100 green=0
```

## Minimum Operational Checklist

1. Candidate manifest fetched and validated.
2. Acceptance attestation verified.
3. Deploy and smoke checks executed.
4. Deployment status and release attestation recorded.

## Non-Goals

1. No production rehearsal gate in the required release path.
2. No commit-stage SLO gate participation in release decisions.
