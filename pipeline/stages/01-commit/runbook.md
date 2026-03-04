# Commit Stage Runbook

## Purpose

Commit Stage is the only authoritative pre-merge stage.
It builds the candidate exactly once for the merge-queue integrated SHA and publishes it to GHCR.

Workflow: `.github/workflows/01-commit-stage.yml`.

## Entry Criteria

1. Trigger event is `merge_group` (`checks_requested`).
2. Integrated source revision exists and is immutable for this candidate.

## Required Outputs

1. Candidate ID: `sha-<40-char-source-sha>`.
2. Runtime artifact digests for `api`, `web`, `worker`, and migrations.
3. Candidate JSON manifest in GHCR (`compass-release-manifests:<candidateId>`).
4. Candidate OCI release-unit representation in GHCR (`compass-release-units:<candidateId>`).
5. Build provenance/SBOM attestations bound to candidate artifacts.

## Rules

1. Commit Stage is fail-closed.
2. Commit Stage runs once per candidate (no PR duplicate authoritative run).
3. Candidate identity must be deterministic and immutable.
4. Commit Stage does not depend on release/production state.
5. Commit-stage SLO is not a blocking gate.

## Exit Criteria

1. `pass`: merge queue may merge integrated SHA to `main`.
2. `fail`: candidate is rejected and must not merge.
