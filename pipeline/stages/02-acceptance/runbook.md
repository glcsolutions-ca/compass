# Acceptance Gate Runbook

## Purpose

Define the second major gate for release candidates.
This stage proves customer-visible behavior and deployment viability in a production-like environment.

## Entry Criteria

1. Candidate manifest exists and validates against `rc.v1`.
2. Candidate artifacts are digest-pinned and retrievable.
3. Candidate was created by `01-commit` for the same `source.revision`.

## Rules

1. Acceptance consumes the exact candidate manifest published by commit-stage.
2. Acceptance must deploy exact digest references from that manifest.
3. Acceptance must not rebuild or substitute artifacts.
4. Acceptance must execute deployment verification plus acceptance suites.
5. Evidence is recorded per `candidateId` with pass/fail verdict.
6. Candidates failing acceptance are non-promotable.

## Exit Criteria

1. `pass`: candidate can progress to optional later stages and release decision.
2. `fail`: candidate remains stored for audit but is blocked from release.

## Placeholder State

Current implementation uses a temporary placeholder acceptance pass.
This is a short-term bridge and must be replaced with deploy, verify, system, and browser acceptance suites.

## Exit Criteria For Placeholder Removal

1. Acceptance deploy command is versioned in-repo.
2. Acceptance verification is manifest-driven.
3. System and browser suites run against acceptance endpoints.
4. Evidence reflects real gate outcomes.
