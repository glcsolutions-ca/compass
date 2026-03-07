# Acceptance Stage Runbook

## Purpose

Acceptance proves that the candidate produced by Commit behaves as users expect.

## Trigger

Acceptance runs inside `01 Cloud Development Pipeline` on `push` to `main`, after the workflow resolves the candidate that Commit already published for the merged revision.

## Runtime model

Acceptance does not deploy to Azure.

It runs the exact candidate locally in GitHub Actions:

- local Postgres container
- candidate migrations image
- candidate API image with `AUTH_MODE=mock`
- candidate Web image pointing at the candidate API

The acceptance runner explicitly prefetches the candidate images before startup to reduce local container pull variance without changing the coverage model.

## Evidence

Acceptance produces an attestation tied to the release unit subject.

Release must verify that attestation before mutating production.

## Required scope

Acceptance on the required path remains smoke-only:

- one system smoke
- one browser smoke

Broader acceptance or regression journeys should stay outside the mainline critical path.

## Stage boundary

Acceptance is intentionally slower and broader than Commit, but it stays focused on the smallest behavioral proof needed on the required path. Its job is to validate user and system behavior on the already-built candidate, not to absorb every possible regression suite.
