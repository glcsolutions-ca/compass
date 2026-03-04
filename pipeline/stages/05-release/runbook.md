# Release and Rollback Runbook

## Purpose

Release Stage promotes an accepted candidate to production without rebuilding.

Workflow: `.github/workflows/03-release-stage.yml`.

## Release Rules

1. Automatic release trigger is successful Acceptance Stage completion.
2. Manual rollback/redeploy trigger is `workflow_dispatch` with `candidate_id`.
3. Candidate manifest must validate before deploy.
4. Acceptance attestation must exist for candidate subject and `verdict=pass`.
5. Production deploy uses exact candidate artifacts from GHCR.
6. Production smoke checks must pass.
7. Release records GitHub deployment status and release attestation.

## Rollback Rules

1. Rollback means redeploying a previously accepted candidate.
2. Rollback uses the same deploy-from-manifest path as normal release.
3. No source rebuild is allowed for rollback.

## Minimum Operational Checklist

1. Candidate manifest fetched and validated.
2. Acceptance attestation verified.
3. Deploy and smoke checks executed.
4. Deployment status and release attestation recorded.

## Non-Goals

1. No production rehearsal gate in the required release path.
2. No commit-stage SLO gate participation in release decisions.
