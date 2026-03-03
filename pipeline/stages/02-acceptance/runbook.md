# Acceptance Gate Runbook

## Purpose

Define the second major gate for release candidates.
This stage proves customer-visible behavior and deployment viability in a production-like environment.

Workflow: `.github/workflows/acceptance-stage.yml` (triggered by successful `commit-stage` on `main`).

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
7. Acceptance requires repository variables:
   - `ACCEPTANCE_DEPLOY_COMMAND`
   - `ACCEPTANCE_VERIFY_COMMAND`
   - `ACCEPTANCE_API_BASE_URL`
   - `ACCEPTANCE_WEB_BASE_URL`

## Exit Criteria

1. `pass`: candidate can progress to optional later stages and release decision.
2. `fail`: candidate remains stored for audit but is blocked from release.
