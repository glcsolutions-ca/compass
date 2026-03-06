# Pipeline

Compass follows a simplified development pipeline built around one immutable release candidate.

## Stages

### `00 PR Validation`

Pull-request validation only.

### `01 Commit`

Build once and publish the release candidate.

### `02 Acceptance`

Prove that exact candidate behaves correctly using an ephemeral local stack in GitHub Actions.

### `03 Release`

Deploy the exact accepted candidate to stage apps, smoke-test them, run migrations, deploy the same digests to prod apps, and smoke production.

## Candidate flow

The key rule is:

- the candidate is built once in Commit
- Acceptance and Release reuse the exact same digest-pinned artifacts
- later stages do not rebuild from source

## Current release architecture

- one Azure production resource group
- one GitHub deployment environment: `production`
- long-lived stage/prod app pairs in ACA
- automatic release after Acceptance success
- rollback by prior-candidate redeploy
