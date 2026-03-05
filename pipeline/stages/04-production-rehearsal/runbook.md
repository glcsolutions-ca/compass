# Production Rehearsal Runbook

## Purpose

Production Rehearsal deploys API and Web to the inactive production label at `0%` traffic and publishes the label URL for manual testing.

Workflow: `.github/workflows/04-production-rehearsal-stage.yml`.

## Rules

1. Rehearsal triggers automatically after successful Acceptance Stage.
2. Rehearsal also supports manual `workflow_dispatch` with `candidate_id`.
3. Rehearsal verifies the acceptance attestation before mutating production.
4. Rehearsal deploys API and Web only.
5. Rehearsal does not run migrations.
6. Rehearsal does not deploy worker.
7. Rehearsal keeps active label traffic at `100` and inactive label traffic at `0`.
8. Only the newest rehearsed candidate remains promotable.
9. GitHub environment `production-rehearsal` must authenticate with the canonical deploy app via `AZURE_DEPLOY_CLIENT_ID`.

## Output

1. Inactive API URL
2. Inactive Web URL
3. `production-rehearsal-evidence.json`
4. Workflow summary containing the promote command

## Manual Validation Checklist

1. Open the inactive web URL from the workflow summary.
2. Confirm the app loads.
3. Confirm `/v1/auth/entra/start` redirects with the inactive web callback URI.
4. Confirm the preview web talks to the preview API.
5. If validation passes, manually dispatch `05-release-stage.yml` with the candidate id.
6. Use rehearsal as the safe identity-cutover verification step because it moves `0%` production traffic.

## Failure Handling

1. If rehearsal fails, production traffic remains unchanged.
2. If a newer rehearsal succeeds later, the older unreleased rehearsal is superseded automatically.
3. If Release Stage is already in progress, rehearsal is skipped rather than racing it.
