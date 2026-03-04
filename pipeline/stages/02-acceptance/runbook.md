# Acceptance Stage Runbook

## Purpose

Acceptance Stage proves customer-visible behavior for the exact candidate produced by Commit Stage.

Workflow: `.github/workflows/02-acceptance-stage.yml`.

## Entry Criteria

1. Trigger is successful `workflow_run` of Commit Stage.
2. Candidate identity is resolved from `release-candidate-manifest` artifact on the triggering run.
3. If the handoff artifact is absent (for example PR-head non-authoritative run), Acceptance exits success as skipped.
4. Candidate SHA is confirmed on `main` (stale candidates are skipped).
5. Candidate manifest exists in GHCR and validates.

## Rules

1. Acceptance deploys exact digest-pinned artifacts from GHCR.
2. Acceptance must not rebuild artifacts.
3. Acceptance runs system and browser suites.
4. Acceptance emits one attestation bound to candidate subject with `verdict=pass|fail`.
5. Acceptance emits the same canonical `release-candidate-manifest` artifact for release-stage resolution.
6. Missing candidate or failed suites are fail-closed.

## Exit Criteria

1. `pass`: release automation may promote the candidate.
2. `fail`: candidate is non-promotable.
3. `skip`: stale candidate not on `main`; no promotion.
