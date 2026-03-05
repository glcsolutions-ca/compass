# Acceptance Stage Runbook

## Purpose

Acceptance Stage proves customer-visible behavior for the exact candidate produced by Commit Stage.

Workflow: `.github/workflows/02-acceptance-stage.yml`.

## Hardening Notes

1. Workflow actions are SHA-pinned and updated by Dependabot.
2. Acceptance intentionally avoids `pnpm` cache in this privileged `workflow_run` stage.

## Entry Criteria

1. Trigger is successful `workflow_run` of Commit Stage.
2. Candidate identity is resolved from triggering `workflow_run.head_sha` and canonical GHCR manifest.
3. Candidate SHA is confirmed on `main` (stale candidates are skipped).
4. Candidate manifest exists in GHCR and validates.

## Rules

1. Acceptance deploys exact digest-pinned artifacts from GHCR.
2. Acceptance must not rebuild artifacts.
3. Acceptance runs system and browser suites.
4. Acceptance emits one attestation bound to candidate subject with `verdict=pass|fail`.
5. Missing candidate or failed suites are fail-closed.

## Local Runner Readiness

1. GitHub acceptance verification polls local API and web endpoints until they are ready (up to 60 seconds).
2. Readiness retries absorb short container startup races instead of failing immediately with transient connection errors.
3. Persistent readiness failures remain fail-closed and surface explicit network/error context in logs.

## Exit Criteria

1. `pass`: release automation may promote the candidate.
2. `fail`: candidate is non-promotable.
3. `skip`: stale candidate not on `main`; no promotion.
