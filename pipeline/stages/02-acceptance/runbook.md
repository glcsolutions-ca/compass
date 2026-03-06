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

## Evidence

Acceptance produces an attestation tied to the release unit subject.

Release must verify that attestation before mutating production.
