# Release Candidate Contract

## Candidate Identity

A release candidate is identified as:

```text
sha-<40-character-merge-group-sha>
```

The candidate is immutable after Commit Stage publication.

## Candidate Contents

Each candidate manifest contains digest-pinned references for:

- API image
- Web image
- Migrations image

## Promotion Path

The required promotion path is:

1. `Commit Stage`
2. `Acceptance Stage`
3. `Release Stage`

A candidate is releasable only if:

- the acceptance attestation exists and passed
- the exact candidate manifest is still retrievable from GHCR

## Release Rules

- Release deploys API and Web to long-lived stage apps first.
- Stage health smoke runs before migrations and is limited to safe, read-only checks.
- Migrations run after stage health smoke and before stage auth smoke / prod deploy.
- Stage auth smoke runs after migrations because Entra login startup persists OIDC request state in the database.
- Prod deploy uses the same candidate image digests that were tested on stage.
- Production smoke must pass before release attestation is written.
- Release happens before the queued change merges to `main`.

## Rollback Rules

Rollback is a prior-candidate redeploy:

1. choose a previously accepted candidate id
2. rerun `01 Development Pipeline` manually with that `candidate_id`

There is no traffic-flip rollback in this architecture.
