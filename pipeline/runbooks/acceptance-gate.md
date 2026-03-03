# Acceptance Gate Runbook

## Purpose

Define the automated acceptance gate behavior for release candidates.

## Rules

1. Acceptance consumes the exact candidate manifest published by commit-stage.
2. Acceptance must not rebuild or substitute artifacts.
3. Evidence is recorded per `candidateId` with pass/fail verdict.
4. Candidates failing acceptance are non-promotable.

## Placeholder State

Current implementation uses a temporary placeholder acceptance pass.
This is a short-term bridge and must be replaced with deploy, verify, system, and browser acceptance suites.

## Exit Criteria For Placeholder Removal

1. Acceptance deploy command is versioned in-repo.
2. Acceptance verification is manifest-driven.
3. System and browser suites run against acceptance endpoints.
4. Evidence reflects real gate outcomes.
