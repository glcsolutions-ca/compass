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
3. Auto mode resolves candidate identity from `release-candidate-manifest` artifact on the triggering acceptance run.
4. If the handoff artifact is absent (for example stale/skip acceptance path), release exits success as skipped.
5. Candidate manifest must validate before deploy.
6. Acceptance attestation must exist for candidate subject and `verdict=pass` (verified with `gh attestation verify` plus candidate/business-rule checks).
7. Production deploy uses exact candidate artifacts from GHCR.
8. Production smoke checks must pass.
9. Release records GitHub deployment status and release attestation.

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
