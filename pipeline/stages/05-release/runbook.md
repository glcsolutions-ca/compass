# Release and Rollback Runbook

## Release Rules

1. Release can promote only candidates with acceptance evidence `verdict=pass`.
2. Release can promote only candidates with production rehearsal evidence `verdict=pass`.
3. Candidate and evidence identity must match (`candidateId`, `sourceRevision`).
4. Release deploys production directly from the release candidate manifest in this bare-minimum phase (no rebuild, no source redeploy).
5. Release records evidence linked to `candidateId` and `sourceRevision`.
6. Release gate is fail-closed; promotion must not run when evidence checks fail.
7. Release supports two entry modes:
   - automatic trigger from successful `Staging / Manual Test Stage (Production Rehearsal Placeholder)`;
   - manual `workflow_dispatch` for rollback/redeploy.

## Rollback Rules

1. Roll back by redeploying a previously accepted candidate.
2. Do not perform incremental rollback procedures outside the normal deploy path.
3. Record rollback evidence using the same pipeline mechanism.

## Minimum Operational Checklist

1. Candidate manifest fetched and validated.
2. Acceptance evidence fetched and validated.
3. Production rehearsal evidence fetched and validated.
4. Deploy-from-manifest + smoke checks executed.
5. Evidence publication confirmed.

## Temporary Debt (Explicit)

1. Automatic release depends on placeholder rehearsal, not real production rehearsal.
2. Release currently performs direct deploy-from-manifest because rehearsal is placeholder-only.

## Exit Criteria for Removing Temporary Debt

1. Replace placeholder rehearsal with real zero-traffic rehearsal.
2. Shift release from direct deploy to promotion of already rehearsed revision.
3. Keep manual fallback path for rollback/redeploy by candidate id.
