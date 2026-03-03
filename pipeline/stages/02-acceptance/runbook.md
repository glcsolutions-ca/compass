# Automated Acceptance Test Stage Runbook

## Purpose

Define the second major gate for release candidates.
This stage proves customer-visible behavior and deployment viability in a production-like environment.

Workflow: `.github/workflows/02-automated-acceptance-test-stage.yml` (triggered by successful `01-commit-stage` on `main`).

## Entry Criteria

1. Candidate manifest exists and validates against `rc.v1`.
2. Candidate artifacts are digest-pinned and retrievable.
3. Candidate was created by `01-commit-stage` for the same `source.revision`.

## Rules

1. Acceptance consumes the exact candidate manifest published by commit stage.
2. Acceptance must deploy exact digest references from that manifest.
3. Acceptance must not rebuild or substitute artifacts.
4. Acceptance must execute deployment verification plus acceptance suites.
5. Evidence is recorded per `candidateId` with pass/fail verdict.
6. Candidates failing acceptance are non-promotable.
7. Acceptance uses environment-scoped configuration variables:
   - `API_BASE_URL`
   - `WEB_BASE_URL`
   - `PEER_API_BASE_URL`
   - `PEER_WEB_BASE_URL`
   - `AZURE_RESOURCE_GROUP`
   - `AZURE_CONTAINERAPP_API_NAME`
   - `AZURE_CONTAINERAPP_WEB_NAME`
   - `AZURE_CONTAINERAPP_WORKER_NAME`
   - `AZURE_MIGRATION_JOB_NAME`
   - `AZURE_CLIENT_ID`
   - `AZURE_TENANT_ID`
   - `AZURE_SUBSCRIPTION_ID`

## Exit Criteria

1. `pass`: candidate can progress to production rehearsal and release decision.
2. `fail`: candidate remains stored for audit but is blocked from later stages.
