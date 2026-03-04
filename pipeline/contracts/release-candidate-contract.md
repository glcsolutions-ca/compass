# Release Candidate Contract (v1)

**Status:** Proposed v1  
**Owner:** Platform / Delivery Engineering  
**Applies to:** `api`, `web`, `worker`, and database migrations  
**Canonical location:** `pipeline/contracts/release-candidate-contract.md`

---

## Purpose

This document defines the canonical **Release Candidate** contract for the application.

Its purpose is to make the deployment pipeline unambiguous and machine-checkable:

- the team knows **what counts as a release candidate**;
- the Commit Stage knows **when a candidate exists**;
- later stages know **exactly what they are allowed to deploy**;
- production receives **the same artifacts that were tested earlier**.

This contract is intentionally normative. The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, and **MAY** are to be interpreted as requirement language.

---

## Design basis

This contract adopts the core deployment-pipeline principles taught by Dave Farley and Jez Humble:

1. **Always-deployable software** - the system should remain releasable continuously.
2. **Pipeline as the system of truth** - stage evidence, not opinion, determines progress.
3. **Build once, promote unchanged** - the release candidate is created once in the Commit Stage and reused unchanged in later stages.
4. **Fast feedback first** - the Commit Stage should be fast and decisive.
5. **Acceptance is a real gate** - candidates that fail automated acceptance do not progress.
6. **Same deployment process everywhere** - environments differ by configuration, not by deployment mechanism or rebuilt artifacts.

---

## Scope

### In scope for v1

For v1, the **releasable unit** is the application runtime as a single coordinated release candidate composed of:

- `api`
- `web`
- `worker`
- database migrations

A valid v1 Release Candidate represents **one coherent version** of this runtime.

### Out of scope for v1

The following are **not** part of the Release Candidate contract itself:

- docs-only changes;
- pipeline policy decisions such as `deploymentRequired`, `promotionHalted`, or `riskClass`;
- environment-specific secrets, credentials, hostnames, scaling values, or DNS;
- human approval records;
- branch-protection configuration and CODEOWNERS policy.

Those items are important, but they belong to **stage evidence** or to repository governance, not to the Release Candidate manifest.

---

## Definitions

### Release Candidate

A **Release Candidate** is the complete, immutable, deployable description of one version of the application runtime.

For v1, that means the exact artifact references for:

- the `api` image,
- the `web` image,
- the `worker` image,
- and the migrations artifact.

### Commit Stage

The **Commit Stage** is the first authoritative pipeline stage for an integrated merge-queue candidate.

It is responsible for:

- building the release candidate once;
- running fast, high-value automated checks;
- publishing immutable artifact references;
- and declaring whether a valid candidate exists.

### Automated Acceptance Test Stage

The **Automated Acceptance Test Stage** deploys the exact Release Candidate into a production-like environment and runs broader automated tests.

A candidate that fails this stage MUST NOT progress to later stages.

### Staging / Manual Test Stage

A **Staging** or **Manual Test Stage** is an optional later stage used for exploratory testing, UAT, rehearsal, or similar activities.

If present, it MUST deploy the same Release Candidate that passed earlier stages.

### Artifact Storage

**Artifact Storage** is the canonical system of record for deployable outputs and their metadata.

For this application, artifact storage SHOULD be an OCI-capable registry or equivalent managed store. The source repository MAY contain the schema and documentation for the contract, but it MUST NOT be treated as the canonical store for built release candidates.

---

## Release model for v1

### Single coordinated candidate

For v1, the default model is **one coordinated candidate per integrated revision**.

That means:

- `api`, `web`, and `worker` are treated as part of the same releasable unit;
- migrations are packaged with that candidate;
- automated acceptance validates the runtime as a whole;
- later stages promote the same candidate as a unit.

### Rule for future decomposition

A component MAY move to its own independent pipeline only if it becomes a genuinely independent releasable unit with:

- separate artifact identity,
- separate acceptance evidence,
- separate promotion rules,
- and separate rollback semantics.

Until that is explicitly introduced, `api`, `web`, `worker`, and migrations ship together.

---

## Candidate identity

Each Release Candidate MUST have a stable identity.

### Required identity fields

A candidate MUST include:

- `schemaVersion`
- `candidateId`
- `source.repository`
- `source.revision`
- `source.createdAt`

### Identity rules

1. `candidateId` MUST uniquely identify the candidate.
2. `source.revision` MUST identify the exact integrated source revision used to build the candidate.
3. Artifact references MUST be immutable digest-pinned references, not mutable tags.
4. A candidate is defined by its artifact digests. Human-friendly tags MAY exist, but tags are aliases and MUST NOT be treated as identity.

---

## Candidate contents

A valid v1 Release Candidate MUST include references for the following artifacts:

- `artifacts.apiImage`
- `artifacts.webImage`
- `artifacts.workerImage`
- `artifacts.migrationsArtifact`

### Content rules

1. Each required artifact reference MUST be present.
2. Each artifact reference MUST be immutable and digest-pinned.
3. The candidate MUST be environment-agnostic.
4. The candidate MUST NOT contain environment-specific configuration values, secrets, or credentials.
5. The candidate SHOULD include provenance references such as SBOM, signature, or attestations when available.

### Environment-specific inputs

The following MAY vary by environment without changing the candidate:

- secrets;
- runtime configuration values;
- DNS names and hostnames;
- replica counts and scaling settings;
- environment-specific service endpoints.

These values are deployment inputs, not part of the Release Candidate identity.

---

## Canonical manifest schema

The canonical v1 manifest MUST conform to the following logical shape.

```yaml
schemaVersion: rc.v1
candidateId: sha-abcdef1234567890abcdef1234567890abcdef12
source:
  repository: org/repo
  revision: abcdef1234567890abcdef1234567890abcdef12
  createdAt: 2026-03-03T18:05:12Z
artifacts:
  apiImage: ghcr.io/org/app-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  webImage: ghcr.io/org/app-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  workerImage: ghcr.io/org/app-worker@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
  migrationsArtifact: ghcr.io/org/app-migrations@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
provenance:
  commitStageRunId: 123456789
  sbomRefs:
    - oci://ghcr.io/org/app-api-sbom@sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
  signatureRefs:
    - oci://ghcr.io/org/app-api-signature@sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
```

### Required fields

| Field                          | Required | Notes                                                   |
| ------------------------------ | -------- | ------------------------------------------------------- |
| `schemaVersion`                | Yes      | MUST be `rc.v1` for this version of the contract.       |
| `candidateId`                  | Yes      | Unique identifier for the Release Candidate (`sha-<40-char source SHA>`). |
| `source.repository`            | Yes      | Repository identifier.                                  |
| `source.revision`              | Yes      | Exact integrated revision used to build the candidate.  |
| `source.createdAt`             | Yes      | UTC timestamp of candidate creation.                    |
| `artifacts.apiImage`           | Yes      | Digest-pinned OCI reference.                            |
| `artifacts.webImage`           | Yes      | Digest-pinned OCI reference.                            |
| `artifacts.workerImage`        | Yes      | Digest-pinned OCI reference.                            |
| `artifacts.migrationsArtifact` | Yes      | Digest-pinned reference to migrations package or image. |
| `provenance.commitStageRunId`  | Yes      | CI run that created the candidate.                      |
| `provenance.sbomRefs`          | No       | SHOULD be present when available.                       |
| `provenance.signatureRefs`     | No       | SHOULD be present when available.                       |

### Forbidden fields in the candidate manifest

The manifest MUST NOT contain policy or stage-outcome fields such as:

- `deploymentRequired`
- `riskClass`
- `promotionHalted`
- `postMergeVerificationFailed`
- human approval outcomes
- environment-specific rollout decisions

Those values belong in stage evidence, not in the Release Candidate contract.

## Validation source of truth

The JSON schema files under `pipeline/` are the executable source of truth for contract validation:

- `pipeline/contracts/schemas/release-candidate.schema.json`
- `pipeline/contracts/schemas/acceptance-evidence.schema.json`
- `pipeline/contracts/schemas/release-evidence.schema.json`

Runtime validators MUST use these schemas directly. Custom validation rules SHOULD be added only where schema constraints cannot express required behavior.

Current custom exception:

- `riskClass`, `deploymentRequired`, `promotionHalted`, and `acceptancePassed` are explicitly rejected at top-level in release-candidate validation to preserve clear operator error messaging.

---

## Commit Stage requirements

The Commit Stage is the only stage that creates the authoritative Release Candidate.

### The Commit Stage MUST

1. Check out the exact integrated source revision.
2. Run the required fast automated checks.
3. Build the official `api`, `web`, and `worker` images.
4. Package the official migrations artifact.
5. Publish all artifacts to canonical artifact storage.
6. Publish the Release Candidate manifest.
7. Record pass/fail evidence for the Commit Stage.

### The Commit Stage MUST NOT

1. Depend on production-only environment data.
2. Publish mutable-only artifact identifiers such as `latest` without digests.
3. Delegate authoritative candidate creation to a later stage.
4. Require later stages to rebuild any deployable artifact.

### Performance expectation

The Commit Stage SHOULD complete in minutes, not tens of minutes, and SHOULD remain the fastest authoritative gate in the pipeline.

---

## Promotion invariants

Later stages promote a candidate; they do not reinterpret or recreate it.

### Promotion rules

1. Automated Acceptance, Staging, and Release MUST deploy the same artifact digests declared in the Release Candidate manifest.
2. No later stage MAY rebuild `api`, `web`, `worker`, or migrations for the same candidate.
3. The deployment mechanism SHOULD be the same across acceptance, staging, and production, with environment-specific configuration provided separately.
4. A stage MAY add evidence, approvals, signatures, or status metadata, but it MUST NOT change candidate identity.
5. A later stage MAY add human-friendly tags or aliases, but the digest-pinned references remain authoritative.

---

## Stage evidence model

Stage evidence is separate from the Release Candidate manifest.

### Stage evidence SHOULD record

- stage name;
- environment name;
- pipeline run identifier;
- start and finish timestamps;
- verdict;
- relevant logs, reports, and test summaries;
- approvals where applicable;
- promotion decision and reason.

### Stage evidence MAY include

- `deploymentRequired`
- `riskClass`
- `promotionHalted`
- `postMergeVerificationFailed`
- reason codes for operational decisions

This separation is intentional:

- the **Release Candidate manifest** answers **what is being promoted**;
- the **stage evidence** answers **what happened to it**.

---

## Acceptance and release rules

### Automated Acceptance Test Stage

The Automated Acceptance Test Stage MUST:

1. retrieve the candidate from artifact storage;
2. deploy the exact candidate into a production-like environment;
3. run automated deployment, smoke, integration, and acceptance tests;
4. record acceptance evidence;
5. prevent failed candidates from progressing;
6. run tests against the deployed acceptance endpoints for that candidate and MUST NOT fall back to local source-build servers.

### Optional Staging / Manual Test Stage

If a staging or manual test stage exists, it MUST:

1. deploy the exact same candidate;
2. avoid rebuilds or artifact substitution;
3. record stage evidence separately from the candidate manifest.

### Release Stage

The Release Stage MUST:

1. deploy the exact same candidate that passed earlier required stages;
2. use the same deployment process as earlier environments, with only environment-specific configuration varying;
3. record release evidence;
4. leave a clear audit trail linking the production deployment back to `candidateId` and `source.revision`.

---

## Failure and invalidation rules

### Commit Stage failure

If the Commit Stage fails, no valid Release Candidate exists.

Any partial or incomplete outputs from that failed attempt MUST NOT be treated as releasable.

### Acceptance failure

If a candidate fails the Automated Acceptance Test Stage:

1. the candidate MAY remain stored for auditability;
2. the candidate MUST be marked as not accepted for promotion;
3. the candidate MUST NOT progress to Release;
4. a new candidate or a rollback/backout candidate is required for further progress.

### Later-stage failure

If a later stage fails, the failure MUST be recorded as stage evidence against the same `candidateId`.

A failed later stage MUST NOT silently mutate the candidate or rebuild replacement artifacts under the same identity.

### Replacement rule

A materially different set of artifact digests constitutes a **new Release Candidate** and MUST receive a new `candidateId`.

---

## Retention, provenance, and auditability

### Retention

The organization MUST retain:

- candidate manifests for all promoted or released candidates;
- enough stage evidence to support incident analysis, rollback, and audit;
- at least one previously accepted candidate that can be used for rollback/backout.

Exact retention periods MAY be defined in separate operational policy, but retention MUST exceed the maximum supported rollback window.

### Provenance

Where supported by tooling, the pipeline SHOULD publish:

- SBOM references;
- signatures or attestations;
- links to the Commit Stage run that produced the candidate.

### Auditability

It MUST be possible to answer, for any production deployment:

1. which `candidateId` was released;
2. which source revision produced it;
3. which exact artifact digests were deployed;
4. which stages it passed;
5. which prior accepted candidate is available for rollback/backout.

---

## Ownership and change control

### Ownership

The Platform / Delivery Engineering owner is responsible for the integrity of this contract, in collaboration with application teams that publish or consume Release Candidates.

### Change control

Any change to this contract MUST include, in the same change set where practical:

- updates to validators and tests;
- updates to pipeline workflows that produce or consume the manifest;
- updates to examples and operator documentation.

### Versioning

- Backward-compatible clarifications MAY be made within `rc.v1`.
- Breaking changes MUST produce a new schema version, for example `rc.v2`.
- Pipelines MUST validate the declared `schemaVersion` before consuming a candidate.

---

## Valid and invalid examples

### Valid example

A valid candidate:

- contains digest-pinned references for `api`, `web`, `worker`, and migrations;
- identifies the exact source revision;
- can be deployed unchanged in acceptance, staging, and production;
- records stage outcomes separately from the candidate manifest.

### Invalid example: mutable tags only

This is invalid because tags are mutable and do not uniquely identify the candidate:

```yaml
artifacts:
  apiImage: ghcr.io/org/app-api:latest
  webImage: ghcr.io/org/app-web:latest
  workerImage: ghcr.io/org/app-worker:latest
```

### Invalid example: environment data baked into the candidate

This is invalid because candidate identity must remain environment-agnostic:

```yaml
productionApiUrl: https://api.example.com
productionDbPassword: super-secret
replicaCount: 8
```

### Invalid example: policy fields mixed into candidate identity

This is invalid because it mixes pipeline policy with artifact identity:

```yaml
deploymentRequired: true
riskClass: high
promotionHalted: false
```

---

## Practical guidance for this application

For v1, the simplest correct implementation is:

1. **Commit Stage** on each merge-queue integrated candidate to build `api`, `web`, `worker`, and migrations once.
2. **Automated Acceptance Test Stage** to deploy and test that exact candidate.
3. **Optional Staging / Manual Test Stage** only if additional human or operational checks are needed.
4. **Release Stage** to deploy the exact same accepted candidate to production.

This keeps the pipeline aligned to the core rule:

> build once, promote unchanged.

---

## References

This contract is based on the deployment-pipeline model and release-candidate principles described by Dave Farley and Jez Humble, including:

- _Continuous Delivery: Reliable Software Releases through Build, Test, and Deployment Automation_
- _The Deployment Pipeline_ (Dave Farley, 2007)
- Continuous Delivery articles on principles, CI, and release preparation
