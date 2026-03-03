# Release and Rollback Runbook

## Release Rules

1. Release can deploy only candidates with acceptance evidence `verdict=pass`.
2. Candidate and acceptance evidence identity must match (`candidateId`, `sourceRevision`).
3. Release deploys exact digest-pinned artifacts from candidate manifest.
4. Release records evidence linked to `candidateId` and `sourceRevision`.
5. Release gate is fail-closed; deploy must not run when evidence checks fail.

## Rollback Rules

1. Roll back by redeploying a previously accepted candidate.
2. Do not perform incremental rollback procedures outside the normal deploy path.
3. Record rollback evidence using the same pipeline mechanism.

## Minimum Operational Checklist

1. Candidate manifest fetched and validated.
2. Acceptance evidence fetched and validated.
3. Deploy and smoke checks executed.
4. Evidence publication confirmed.
