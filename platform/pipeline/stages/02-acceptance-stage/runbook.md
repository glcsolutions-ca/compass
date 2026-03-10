# Acceptance Stage Runbook

## Purpose

Acceptance Stage proves that the candidate produced by Commit behaves as users expect through public interfaces only.

## Trigger

Acceptance Stage runs inside `20 Continuous Delivery Pipeline` on successful `Commit Stage` completion, after the workflow resolves the candidate that Commit already published for the `main` SHA.

## Runtime model

Acceptance does not deploy to Azure.

It runs the exact candidate locally in GitHub Actions:

- local Postgres container
- candidate API image running the migration and seed command
- candidate API image with `AUTH_MODE=mock`
- candidate Web image pointing at the candidate API

The acceptance runner accepts suites explicitly. The required CDP path runs:

- `api`
- `web`

Those suites are black-box only:

- API acceptance interacts over public HTTP
- Web acceptance interacts through the browser and public UI

Desktop acceptance remains black-box, but it is outside the required CDP path until desktop has a first-class release path in the same promotion model.

## Evidence

Acceptance produces an attestation tied to the release unit subject.

Release Stage must verify that attestation before mutating production.

## Stage boundary

Acceptance Stage is intentionally slower and broader than Commit Stage, but it stays focused on user-observable behavior for the already-built candidate. It is not a place to hide technical integration checks or implementation-specific assertions.
