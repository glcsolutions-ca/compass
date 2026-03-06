# Acceptance Stage Runbook

## Purpose

Acceptance proves that the candidate produced by Commit behaves as users expect.

## Trigger

Acceptance runs inside `01 Development Pipeline` after Commit publishes the release candidate.

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

Broader acceptance or regression journeys should stay outside the merge-queue critical path.

## Reporting target

Acceptance should normally complete within `1m30s`.
