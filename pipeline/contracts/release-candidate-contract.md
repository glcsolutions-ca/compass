# Release Candidate Contract (v1)

**Status:** Active v1 (updated 2026-03-05 for 4-stage GHCR-native promotion flow)  
**Owner:** Platform / Delivery Engineering  
**Applies to:** `api`, `web`, `worker`, and database migrations  
**Canonical location:** `pipeline/contracts/release-candidate-contract.md`

**Update note (2026-03-05):** The required promotion path is now `Commit -> Acceptance -> Production Rehearsal -> Release`. Production rehearsal is required operationally, but it records evidence in the workflow rather than a registry attestation. Release remains the only stage that writes production release attestation.

---

## Purpose

This document defines the canonical **Release Candidate** contract for the application.

The contract makes the pipeline machine-checkable:

- the team knows what counts as a release candidate;
- Commit Stage knows when a candidate exists;
- downstream stages know exactly what they are allowed to deploy;
- production receives the same artifacts that were built and tested earlier.

---

## Design Basis

This contract follows the core deployment-pipeline principles taught by Dave Farley and Jez Humble:

1. Build once, promote unchanged.
2. Pipeline evidence decides promotion, not opinion.
3. Fast automated checks happen early.
4. Acceptance is a real gate.
5. Environments differ by configuration, not by rebuilt artifacts.

---

## Scope

### In Scope for v1

For v1, the releasable unit is one coordinated runtime candidate composed of:

- `api`
- `web`
- `worker`
- database migrations

A valid v1 Release Candidate represents one coherent version of this runtime.

### Out of Scope for v1

The Release Candidate manifest itself does not include:

- environment-specific secrets, credentials, hostnames, or scaling values;
- human approval records;
- rollout policy flags such as `riskClass` or `promotionHalted`;
- branch-protection or CODEOWNERS policy.

Those belong to stage evidence or repository governance, not to the candidate manifest.

---

## Candidate Identity

Each Release Candidate MUST have a stable identity.

Required identity fields:

- `schemaVersion`
- `candidateId`
- `source.repository`
- `source.revision`
- `source.createdAt`

Identity rules:

1. `candidateId` uniquely identifies the candidate.
2. `source.revision` identifies the exact integrated source revision used to build the candidate.
3. Artifact references MUST be immutable digest-pinned references.
4. A candidate is defined by its artifact digests, not by mutable tags.

Cross-workflow resolution rules:

1. GHCR manifest packages keyed by `candidateId` are the canonical cross-workflow source of truth.
2. Automatic stages derive `candidateId=sha-<workflow_run.head_sha>` from the triggering run, then fetch the GHCR manifest.
3. Manual stages accept explicit `candidate_id` input and resolve the same GHCR manifest.
4. Stage jobs MUST checkout `source.revision` from the resolved manifest, not branch tip.

---

## Candidate Contents

A valid v1 Release Candidate MUST include immutable references for:

- `artifacts.apiImage`
- `artifacts.webImage`
- `artifacts.workerImage`
- `artifacts.migrationsArtifact`

Content rules:

1. Each required artifact reference MUST be present.
2. Each artifact reference MUST be digest-pinned.
3. The candidate MUST be environment-agnostic.
4. The candidate MUST NOT contain environment-specific secrets or rollout decisions.
5. Provenance references such as release-unit digest, SBOMs, or signatures SHOULD be present when available.

---

## Stage Model

### Commit Stage

Purpose:

- build and publish one authoritative candidate for one integrated SHA.

Must do:

1. Run authoritatively on `merge_group` only.
2. Run fast commit checks.
3. Build and push immutable runtime artifacts.
4. Publish one canonical manifest package in GHCR.
5. Attach build provenance/SBOM attestations.

### Acceptance Stage

Purpose:

- prove that the exact candidate behaves correctly in non-prod.

Must do:

1. Trigger from successful Commit Stage via `workflow_run`.
2. Resolve candidate identity from GHCR.
3. Guard against stale candidates by requiring SHA presence on `main`.
4. Deploy the exact candidate digests from GHCR.
5. Run automated acceptance suites.
6. Attach acceptance attestation to the candidate subject.

### Production Rehearsal Stage

Purpose:

- deploy the exact accepted candidate to the inactive production blue/green label at `0%` traffic and prove it on real URLs.

Must do:

1. Trigger automatically from successful Acceptance Stage.
2. Also support manual `workflow_dispatch` by `candidate_id`.
3. Verify acceptance attestation before mutating production.
4. Resolve active and inactive labels.
5. Deploy only API and Web to the inactive label.
6. Keep inactive label traffic at `0%`.
7. Smoke inactive API, inactive Web, and inactive Entra redirect behavior.
8. Record production rehearsal evidence.

Notes:

- Rehearsal is required operationally for promotion.
- Worker and migrations are out of scope for blue/green rehearsal in v1.

### Release Stage

Purpose:

- manually promote the exact rehearsed candidate to production.

Must do:

1. Trigger only by manual `workflow_dispatch` with `candidate_id`.
2. Use the GitHub `production` environment as the human approval boundary.
3. Verify acceptance attestation again.
4. Verify the requested candidate is still the one rehearsed on the inactive label.
5. Rerun inactive-slot smoke before production mutation.
6. Run migrations.
7. Deploy worker.
8. Flip API and Web label traffic.
9. Run production smoke verification.
10. Deactivate old active revisions so only blue and green remain active.
11. Record release attestation.

---

## Promotion Invariants

1. Candidate identity is immutable and digest-based.
2. Stage evidence is attached to the same candidate subject or workflow evidence record.
3. Any material artifact change requires a new candidate identity.
4. Rollback is candidate re-promotion, not source reconstruction.
5. API and Web promotion is a traffic switch, not a rebuild.

---

## Rollback Model

1. Fast rollback is label traffic reversal for API and Web.
2. Fast rollback remains valid only until the next rehearsal overwrites the inactive label.
3. Durable rollback is re-rehearsing and re-promoting a previously accepted candidate.
4. Worker rollback is handled by re-promoting a prior accepted candidate.

---

## Validation Source of Truth

The JSON schemas under `pipeline/contracts/schemas/` are the executable source of truth for pipeline contract validation:

- `release-candidate.schema.json`
- `acceptance-attestation-predicate.schema.json`
- `production-rehearsal-evidence.schema.json`
- `release-attestation-predicate.schema.json`
