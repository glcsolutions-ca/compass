# Commit Stage Operating Model

## Purpose

This runbook defines how the team operates the authoritative `commit-stage` pipeline on `main`.
It formalizes stop-the-line behavior, ownership, escalation, and weekly optimization discipline.

## Policy: Developers Wait for Commit Stage

1. Every change merged to `main` is followed by a `commit-stage` run.
2. The developer(s) responsible for the merged change remain accountable until the run is green.
3. If `commit-stage` is red, new work pauses until the failure is fixed forward or backed out.
4. A release candidate exists only when commit-stage passes candidate generation and publication.

## Red Trunk Rules

1. First priority is restoring green `main`.
2. Preferred recovery order:
   1. fast forward-fix in the smallest possible change;
   2. backout candidate when forward-fix is not immediate;
   3. follow-up hardening change after trunk is restored.
3. Do not bypass gates or mutate candidate identity to force progression.

## Ownership and Escalation

| Failure Class                                     | Primary Owner     | Secondary Owner   | Escalate After | Target MTTR       |
| ------------------------------------------------- | ----------------- | ----------------- | -------------- | ----------------- |
| Commit quick gate (`test:quick`)                  | Merging engineer  | Feature team lead | 15 minutes     | <= 30 minutes     |
| Commit analysis thresholds (coverage/duplication) | Feature team lead | Platform/Delivery | 30 minutes     | <= 1 business day |
| Image build/publish                               | Platform/Delivery | App owner         | 20 minutes     | <= 45 minutes     |
| Candidate manifest generation/validation          | Platform/Delivery | App owner         | 15 minutes     | <= 30 minutes     |
| Acceptance deploy/verify command                  | Platform/Delivery | Infra owner       | 20 minutes     | <= 1 hour         |
| Acceptance tests (system/e2e)                     | App owner         | Feature team lead | 30 minutes     | <= 1 business day |
| Evidence publication/retrieval                    | Platform/Delivery | Infra owner       | 20 minutes     | <= 45 minutes     |
| Release-stage evidence gate                       | Platform/Delivery | App owner         | 20 minutes     | <= 1 hour         |

## Failure Taxonomy

| Code    | Class                           | Typical Signal                   | Immediate Action                                                        |
| ------- | ------------------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| CMT-001 | Compilation/type failure        | `typecheck` step failed          | Fix forward/backout immediately                                         |
| CMT-002 | Commit test failure             | `test:quick` failed              | Fix test or defect; re-run                                              |
| CMT-003 | Analysis threshold breach       | `commit-analysis` verdict `fail` | Improve coverage/reduce duplication or adjust approved threshold change |
| CMT-004 | Build/publish failure           | Docker/registry error            | Repair build config or registry auth and re-run                         |
| CMT-005 | Candidate contract failure      | manifest validation failed       | Fix generator/schema mismatch; do not promote                           |
| ACC-001 | Acceptance endpoint unavailable | precheck `/health` or `/` failed | Repair acceptance deploy/route before deeper tests                      |
| ACC-002 | Acceptance functional failure   | system/e2e fail                  | Fix product defect; candidate remains non-promotable                    |
| EVT-001 | Evidence mismatch/missing       | release gate rejects evidence    | Repair evidence generation or retrieval path                            |

## Weekly Reliability Review (Required)

Run this weekly with Platform + app owners:

1. Review top acceptance failures from the week.
2. Select at least one recurrent late-stage failure class.
3. Add a fast commit-stage detector for that class.
4. Track the change in failure discovery stage over time.

### Required Output

1. One moved-left failure rule per cycle (minimum).
2. Updated threshold/guardrail rationale where changed.
3. Link to implementing PR and resulting metric delta.
