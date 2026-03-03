# Automated Acceptance Test Stage Runbook

## Purpose

Define the second major gate for release candidates.
This stage proves customer-visible behavior and deployment viability on GitHub-hosted runner resources for the bare-minimum pipeline baseline.

Workflow: `.github/workflows/02-automated-acceptance-test-stage.yml` (triggered by successful `01-commit-stage` on `main`).

## Entry Criteria

1. Candidate manifest exists and validates against `rc.v1`.
2. Candidate artifacts are digest-pinned and retrievable.
3. Candidate was created by `01-commit-stage` for the same `source.revision`.

## Rules

1. Acceptance consumes the exact candidate manifest published by commit stage.
2. Acceptance must deploy exact digest references from that manifest.
3. Acceptance must not rebuild or substitute artifacts.
4. Acceptance must execute deployment verification plus acceptance suites on runner-local resources (Docker network, Postgres, migrations, API, Web).
5. Evidence is recorded per `candidateId` with pass/fail verdict.
6. Candidates failing acceptance are non-promotable.
7. Worker runtime is placeholder-only in this stage:
   - worker digest must be pulled/validated from the release candidate manifest;
   - worker process is intentionally not started (no Service Bus emulator in bare-minimum acceptance).
8. Acceptance stage uses fixed local endpoints:
   - `API_BASE_URL=http://127.0.0.1:3001`
   - `WEB_BASE_URL=http://127.0.0.1:3000`

## Temporary Debt (Explicit)

1. Worker runtime is not exercised in acceptance yet.
2. Acceptance environment is runner-local, not a production-like managed environment.

## Exit Criteria for Removing Temporary Debt

1. A stable acceptance dependency strategy exists for worker messaging (for example, emulator/test-double or dedicated managed acceptance bus).
2. Acceptance deploy path migrates from runner-local resources to managed infrastructure while preserving build-once/promote-unchanged.
3. Worker runtime checks become first-class in acceptance and are no longer placeholder.

## Exit Criteria

1. `pass`: candidate can progress to production rehearsal and release decision.
2. `fail`: candidate remains stored for audit but is blocked from later stages.
