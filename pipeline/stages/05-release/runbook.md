# Release and Rollback Runbook

## Purpose

Release Stage manually promotes an already rehearsed candidate to production without rebuilding API or Web.

Workflow: `.github/workflows/05-release-stage.yml`.

## Release Rules

1. Release is manual only: `workflow_dispatch` with `candidate_id`.
2. GitHub `production` environment approval is the human promotion gate.
3. Candidate manifest must validate before deploy.
4. Acceptance attestation must exist for the same candidate subject with `verdict=pass`.
5. Release must verify the requested candidate is still rehearsed on the inactive label.
6. Release reruns inactive-slot smoke before production mutation.
7. Release runs migrations before traffic shift.
8. Release deploys worker before traffic shift.
9. Release promotes by flipping API and Web label traffic to the rehearsed label.
10. Release then runs production smoke checks.
11. Release deactivates old active API and Web revisions so only blue and green remain active.
12. Release records GitHub deployment status and release attestation.

## Rollback Rules

1. Fast rollback is API/Web label traffic reversal.
2. Fast rollback is only valid until the next rehearsal overwrites the inactive label.
3. Worker rollback is not covered by label reversal.
4. Durable rollback is: rehearse a prior accepted candidate, then promote it.
5. No source rebuild is allowed for rollback.

## Blue/Green Rules

1. Release labels are `blue` and `green`.
2. Rehearsal always targets the inactive label at `0%`.
3. Release always promotes the rehearsed inactive label to `100%`.
4. Cleanup must leave exactly two active revisions per app: one behind `blue`, one behind `green`.

## Entra Redirect URI Checklist

1. `infra/identity` must include slot callback URIs for `blue` and `green`.
2. All custom domains must be present in `web_custom_domains`.
3. If SSO smoke fails with `AADSTS50011`, verify the Entra redirect URI list first.

## Fast Rollback Commands

```bash
az containerapp ingress traffic set \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$ACA_API_APP_NAME" \
  --label-weight blue=100 green=0

az containerapp ingress traffic set \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$ACA_WEB_APP_NAME" \
  --label-weight blue=100 green=0
```

Swap `blue` and `green` as needed for the current incident.

## Durable Rollback Steps

1. Identify the previous accepted `candidate_id`.
2. Manually run `.github/workflows/04-production-rehearsal-stage.yml` with that `candidate_id`.
3. Validate the rehearsal URL.
4. Manually run `.github/workflows/05-release-stage.yml` with that `candidate_id`.

## Minimum Operational Checklist

1. Candidate manifest fetched and validated.
2. Acceptance attestation verified.
3. Candidate confirmed as the currently rehearsed inactive label.
4. Inactive-slot smoke checks executed.
5. Migrations completed.
6. Worker deployed.
7. Production smoke checks executed.
8. Cleanup completed so only blue and green remain active.
9. Release attestation recorded.
