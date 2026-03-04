# Commit Stage Operating Model

## Purpose

This runbook defines team operating behavior for the authoritative Commit Stage.
Commit Stage is the only pre-merge gate in the merge queue path.

Workflow: `.github/workflows/01-commit-stage.yml` (`name: Commit Stage`, trigger: `merge_group`).

## Policy: Commit Stage Is Authoritative

1. Merge-queue candidates must pass Commit Stage before merge to `main`.
2. Commit Stage is the only stage that builds and publishes the release candidate.
3. A release candidate exists only when Commit Stage passes manifest generation/publication.
4. Post-merge stages consume that exact candidate; they do not rebuild.

## Candidate Identity

1. `candidateId` is `sha-<40-char-source-sha>`.
2. Candidate identity is immutable digest-pinned artifacts plus source revision.
3. Re-runs for the same `candidateId` must be byte-for-byte equivalent for source/artifact identity.
4. Tag conflicts with different artifact identity fail closed.

## Red Candidate Rules

1. First priority is restoring a passing Commit Stage for the queued candidate.
2. Preferred recovery order:
   1. smallest forward fix;
   2. backout when forward fix is not immediate;
   3. follow-up hardening after green is restored.
3. Do not bypass gates or mutate candidate identity to force progression.

## Ownership and Escalation

| Failure Class                                                       | Primary Owner     | Secondary Owner   | Escalate After | Target MTTR       |
| ------------------------------------------------------------------- | ----------------- | ----------------- | -------------- | ----------------- |
| Commit candidate gate (`test:commit:candidate`)                     | Merging engineer  | Feature team lead | 15 minutes     | <= 30 minutes     |
| Commit analysis thresholds (coverage/duplication/complexity/cycles) | Feature team lead | Platform/Delivery | 30 minutes     | <= 1 business day |
| Image build/publish                                                 | Platform/Delivery | App owner         | 20 minutes     | <= 45 minutes     |
| Candidate manifest generation/validation                            | Platform/Delivery | App owner         | 15 minutes     | <= 30 minutes     |

## Weekly Reliability Review (Required)

1. Review recurring acceptance/release failures.
2. Move at least one recurring late failure left into Commit Stage.
3. Track reduction in late-stage discovery over time.
