# Automated Acceptance Test Stage Runbook

## Purpose

Define the second major Farley gate for release candidates.
This stage proves customer-visible behavior and deployment viability for the exact candidate merged to `main`.

Workflow: `.github/workflows/02-automated-acceptance-test-stage.yml` (`name: Automated Acceptance Test Stage`, trigger: `push` on `main`).

## Entry Criteria

1. Candidate manifest exists for `candidateId=sha-<push-sha>`.
2. Candidate manifest validates against `rc.v1`.
3. Candidate artifacts are digest-pinned and retrievable.
4. `manifest.source.revision` equals the pushed `main` revision.

## Rules

1. Acceptance consumes the exact candidate manifest published by Commit Stage.
2. Acceptance must not rebuild or substitute artifacts.
3. Acceptance deploys exact digest references from the manifest.
4. Acceptance runs system and browser suites in parallel.
5. Evidence is recorded per `candidateId` with pass/fail verdict.
6. Missing candidate manifest is fail-closed.
7. Candidates failing acceptance are non-promotable.
8. Worker runtime is placeholder-only in this baseline:
   - worker digest must be validated from manifest;
   - worker process is intentionally not started in runner-local acceptance.

## Temporary Debt (Explicit)

1. Worker runtime is not fully exercised in acceptance yet.
2. Acceptance environment is runner-local, not managed infrastructure.

## Exit Criteria

1. `pass`: candidate can progress to Staging / Manual Test Stage.
2. `fail`: candidate remains stored for audit but is blocked from later stages.
