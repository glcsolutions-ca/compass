# Commit Stage Runbook

## Purpose

Commit Stage is the only authoritative pre-merge stage.
It builds the candidate exactly once for the merge-queue integrated SHA and publishes it to GHCR.
For merge-queue admission, a separate workflow exposes a lightweight PR-head `Commit Stage` check that does not rebuild or publish artifacts.

Workflows:

1. `.github/workflows/00-queue-admission.yml` (PR-head queue admission only, non-authoritative).
2. `.github/workflows/01-commit-stage.yml` (authoritative `merge_group` commit stage).

## Hardening Notes

1. Workflow actions are SHA-pinned and updated by Dependabot.
2. Commit Stage may retain dependency cache to optimize authoritative build latency.

## Entry Criteria

1. For authoritative candidate publication, trigger event is `merge_group` (`checks_requested`).
2. Integrated source revision exists and is immutable for this candidate.

## Required Outputs

1. Candidate ID: `sha-<40-char-source-sha>`.
2. Runtime artifact digests for `api`, `web`, `worker`, and migrations.
3. Candidate JSON manifest in GHCR (`compass-release-manifests:<candidateId>`).
4. Candidate OCI release-unit representation in GHCR (`compass-release-units:<candidateId>`).
5. Build provenance/SBOM attestations bound to candidate artifacts.
6. Canonical handoff artifact (`release-candidate-manifest`) containing the release candidate manifest used by Acceptance and Release.

## Rules

1. Commit Stage is fail-closed.
2. Commit Stage runs once per candidate (no PR duplicate authoritative run).
3. Candidate identity must be deterministic and immutable.
4. Commit Stage does not depend on release/production state.
5. Commit-stage SLO is not a blocking gate.
6. PR-head check path is queue-admission only and must remain non-authoritative.

## Exit Criteria

1. `pull_request pass`: PR is eligible to enter merge queue.
2. `merge_group pass`: merge queue may merge integrated SHA to `main`.
3. `merge_group fail`: candidate is rejected and must not merge.
