# Release and Rollback Runbook

## Release Rules

1. Release can promote only candidates with acceptance evidence `verdict=pass`.
2. Release can promote only candidates with production rehearsal evidence `verdict=pass`.
3. Candidate and evidence identity must match (`candidateId`, `sourceRevision`).
4. Release promotes rehearsed revision to live traffic (no rebuild, no source redeploy).
5. Release records evidence linked to `candidateId` and `sourceRevision`.
6. Release gate is fail-closed; promotion must not run when evidence checks fail.

## Rollback Rules

1. Roll back by promoting/redeploying a previously accepted candidate.
2. Do not perform incremental rollback procedures outside the normal deploy path.
3. Record rollback evidence using the same pipeline mechanism.

## Minimum Operational Checklist

1. Candidate manifest fetched and validated.
2. Acceptance evidence fetched and validated.
3. Production rehearsal evidence fetched and validated.
4. Promotion + smoke checks executed.
5. Evidence publication confirmed.
