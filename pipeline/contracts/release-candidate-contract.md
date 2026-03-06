# Release Candidate Contract

## Candidate Identity

A release candidate is identified as:

```text
sha-<40-character-main-commit-sha>
```

The candidate is immutable after Commit Stage publication.

## Candidate Contents

Each candidate manifest contains digest-pinned references for:

- API image
- Web image
- Migrations image

## Promotion Path

The required promotion path is:

1. `01 Commit Stage`
2. `02 Acceptance Stage`
3. `03 Release Stage`

A candidate is releasable only if:

- the acceptance attestation exists and passed
- the exact candidate manifest is still retrievable from GHCR

## Release Rules

- Release deploys API and Web to long-lived stage apps first.
- Stage smoke is read-only and limited to safe checks.
- Migrations run after stage smoke and before prod deploy.
- Prod deploy uses the same candidate image digests that were tested on stage.
- Production smoke must pass before release attestation is written.

## Rollback Rules

Rollback is a prior-candidate redeploy:

1. choose a previously accepted candidate id
2. re-run `03 Release Stage` with that candidate id

There is no traffic-flip rollback in this architecture.
