# Release Candidate Contract

## Candidate identity

A release candidate is identified as:

```text
sha-<40-character-main-sha>
```

The candidate is immutable after `Commit Stage` publication.

## Candidate contents

Each candidate manifest contains digest-pinned references for:

- API image
- Web image

Candidate provenance also records:

- the source repository and revision
- the Commit Stage run id
- the registry

The manifest is generated once from the built API and Web digests before Commit Stage smoke. Commit smoke, Acceptance Stage, and Release Stage all consume that same manifest contract.

## Promotion path

The required promotion path is:

1. `Commit Stage`
2. `Acceptance Stage`
3. `Release Stage`

A candidate is releasable only if:

- the exact candidate manifest is still retrievable from GHCR

## Release rules

- Release deploys API and Web to long-lived stage apps first
- stage health smoke runs before migrations and is limited to safe, read-only checks
- migrations run after stage health smoke and before stage auth smoke and prod deploy
- stage auth smoke runs after migrations because Entra login startup persists OIDC request state in the database
- prod deploy uses the same candidate image digests that were tested on stage
- production smoke must pass before Release Stage completes
