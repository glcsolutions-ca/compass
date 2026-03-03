# Production Rehearsal Stage Runbook

## Purpose

Provide a temporary placeholder gate between automated acceptance and release in the bare-minimum pipeline baseline.

Workflow: `.github/workflows/04-production-rehearsal-stage.yml` (triggered by successful `02-automated-acceptance-test-stage` on `main`).

## Rules

1. Rehearsal consumes the exact candidate manifest accepted in stage 02.
2. Rehearsal verifies acceptance evidence pass and candidate identity integrity.
3. Rehearsal does not deploy to production in this temporary phase.
4. Rehearsal records pass/fail evidence in `production-rehearsal-evidence.v1` with explicit placeholder summary text.
5. Rehearsal publishes `rehearsal-stage-output` artifact to drive automatic release trigger.

## Temporary Debt (Explicit)

1. This stage is a placeholder gate and does not perform real zero-traffic deployment rehearsal.
2. `zeroTraffic=true` in rehearsal evidence is synthetic until full rehearsal automation is introduced.

## Exit Criteria for Removing Temporary Debt

1. Rehearsal deploys accepted candidates to production infrastructure with zero live traffic.
2. Rehearsal verifies revision health against deployed candidate endpoints.
3. Rehearsal evidence reflects real deployment state rather than placeholder state.

## Exit Criteria

1. `pass`: candidate is eligible for `05-release-stage` promotion.
2. `fail`: candidate is blocked from release until fixed by a new candidate.
