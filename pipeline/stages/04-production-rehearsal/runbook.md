# Production Rehearsal Stage Runbook

## Purpose

Rehearse production deployment for an accepted candidate with zero user traffic.

Workflow: `.github/workflows/04-production-rehearsal-stage.yml` (triggered by successful `02-automated-acceptance-test-stage` on `main`).

## Rules

1. Rehearsal consumes the exact candidate manifest accepted in stage 02.
2. Rehearsal deploys candidate digests unchanged.
3. Rehearsal keeps candidate revisions at 0% traffic.
4. Rehearsal verifies candidate revision health directly.
5. Rehearsal records evidence in `production-rehearsal-evidence.v1`.

## Exit Criteria

1. `pass`: candidate is eligible for `05-release-stage` promotion.
2. `fail`: candidate is blocked from release until fixed by a new candidate.
