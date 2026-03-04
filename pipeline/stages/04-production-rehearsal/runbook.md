# Staging / Manual Test Stage Runbook (Production Rehearsal Placeholder)

## Purpose

Provide the current implementation of the Farley Staging / Manual Test Stage between acceptance and release.
In this baseline, it is an integrity/evidence placeholder and not a real zero-traffic rehearsal yet.

Workflow: `.github/workflows/04-production-rehearsal-stage.yml` (`name: Staging / Manual Test Stage (Production Rehearsal Placeholder)`, triggered by successful `Automated Acceptance Test Stage` on `main`).

## Rules

1. Consume the exact candidate accepted in Automated Acceptance Test Stage.
2. Verify acceptance evidence pass and candidate/source identity integrity.
3. Do not rebuild artifacts.
4. Record pass/fail production-rehearsal evidence with explicit placeholder summary.
5. Publish `rehearsal-stage-output` to drive Release Stage automation.

## Temporary Debt (Explicit)

1. This stage does not perform real zero-traffic deployment rehearsal yet.
2. `zeroTraffic=true` in rehearsal evidence is synthetic until full rehearsal automation is introduced.

## Exit Criteria

1. `pass`: candidate is eligible for Release Stage.
2. `fail`: candidate is blocked from release until fixed by a new candidate.
