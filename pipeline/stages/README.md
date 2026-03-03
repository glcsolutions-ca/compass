# Pipeline Stages (Farley Stage Model)

This document defines the canonical stage model for `pipeline/stages`.
It is intentionally normative: this is how release candidates move from check-in to release.

## Why this exists

The deployment pipeline exists to answer one question with evidence:

Can we safely release this exact candidate now?

We do that by:

1. creating a release candidate once in commit stage;
2. promoting that same candidate unchanged through later stages;
3. rejecting candidates as early as possible when evidence says "not fit."

## Core Principles (Non-Negotiable)

1. Build once, promote unchanged.
2. Fast feedback first; catch obvious breakage early.
3. The pipeline is the system of record, not opinion or meetings.
4. Each stage has a clear purpose and pass/fail signal.
5. Failed candidates do not progress.
6. Release and rollback use the same automated mechanisms.
7. Developers own red pipeline outcomes and fix quickly.

## Stage Order

1. `01-commit`
2. `02-acceptance`
3. `03-nonfunctional` (optional, may be gate or advisory)
4. `04-manual-or-staging` (optional)
5. `05-release`

Later stages consume only candidates that passed required earlier stages.

## Stage Contracts

### 01-commit (Authoritative Candidate Creation)

Purpose:

- Eliminate unfit changes quickly.
- Create the authoritative release candidate.

Must do:

1. Compile/build code.
2. Run fast commit tests (mostly unit + a small high-value fast slice of other tests).
3. Run code health analysis thresholds.
4. Build deployable artifacts for the releasable unit.
5. Publish immutable artifact digests.
6. Generate and validate candidate manifest.

Must not do:

1. Long-running end-to-end suites.
2. Manual checks.
3. Rebuild candidate later to "fix" stage failures.

Timing target:

- Ideal: under 5 minutes.
- Maximum: under 10 minutes.

Exit:

- Pass: candidate exists and is promotable to acceptance.
- Fail: no valid candidate for promotion.

### 02-acceptance (Second Major Gate)

Purpose:

- Prove the candidate delivers expected behavior in a production-like environment.
- Prove deployment works with the same candidate that was built in commit stage.

Must do:

1. Fetch and validate the published candidate manifest.
2. Deploy exact digest-pinned artifacts from that manifest.
3. Run deployment verification and smoke checks.
4. Run automated acceptance tests (cross-service/business outcomes).
5. Record acceptance evidence tied to `candidateId` and `sourceRevision`.

Must not do:

1. Rebuild images/artifacts.
2. Substitute different versions.
3. Treat failing acceptance as "warning only."

Exit:

- Pass: candidate eligible for later stages and release decision.
- Fail: candidate is non-promotable.

### 03-nonfunctional (Optional)

Purpose:

- Evaluate nonfunctional attributes (capacity/performance/security/reliability).

Guidance:

1. Use as a gate when nonfunctional thresholds are strict.
2. Use as advisory evidence where human judgment is required.
3. Keep candidate identity unchanged; only add stage evidence.

### 04-manual-or-staging (Optional)

Purpose:

- Support exploratory testing, UAT, rehearsal, and production-like manual checks.

Rules:

1. Deploy only accepted candidates.
2. Use the same deployment mechanism as other environments.
3. Do not mutate candidate identity.

### 05-release (Production Deployment)

Purpose:

- Push-button deployment of a previously accepted candidate.

Must do:

1. Verify candidate contract and acceptance evidence.
2. Deploy exact digest-pinned artifacts unchanged.
3. Run production smoke verification.
4. Record release evidence.

Rollback/backout:

1. Redeploy a previously accepted candidate using the same mechanism.
2. Do not use a special "one-off rollback process."

## Promotion Invariants

1. Candidate identity is artifact digests + source revision.
2. Environment config may vary; candidate artifacts may not.
3. Stage evidence is separate from candidate manifest.
4. Any material artifact change creates a new candidate.

## Team Operating Discipline

1. Trunk stays releasable.
2. Developers wait for commit-stage result and fix red pipeline immediately.
3. Acceptance failures are owned and fixed with same urgency.
4. Keep moving recurring late failures left into commit stage over time.

## Stage Boundary

Authoritative candidate creation starts at `01-commit` on trunk check-in.
Everything after that is candidate promotion and evidence collection.

## Current State Notes

`02-acceptance` currently includes a temporary placeholder pass in this repository.
That is a transitional implementation detail, not the target operating model.
Target state is full automated deployment verification + acceptance suite as a hard gate.

## Ownership Boundaries in this folder

- `pipeline/contracts`: release-candidate + evidence contracts/schemas.
- `pipeline/shared/scripts`: reusable pipeline mechanics.
- `pipeline/stages/01-commit..05-release`: stage-specific scripts, tests, runbooks.
- `.github/workflows`: orchestration only.

## References

- [The Commit Stage (Humble/Farley)](https://www.informit.com/articles/article.aspx?p=1621865&seqNum=4)
- [Automated Acceptance Test Stage (Humble/Farley)](https://www.informit.com/articles/article.aspx?p=1621865&seqNum=5)
- [Subsequent Test Stages (Humble/Farley)](https://www.informit.com/articles/article.aspx?p=1621865&seqNum=6)
- [Preparing to Release (Humble/Farley)](https://www.informit.com/articles/article.aspx?p=1621865&seqNum=7)
- [Deployment Pipeline Paper (Dave Farley, 2007)](https://continuousdelivery.com/wp-content/uploads/2010/01/The-Deployment-Pipeline-by-Dave-Farley-2007.pdf)
