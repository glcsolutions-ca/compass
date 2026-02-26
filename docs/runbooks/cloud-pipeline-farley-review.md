# Cloud Pipeline Farley-First Review (Collaborative)

## Purpose

Run a strict, stage-by-stage, cloud-only review of the Compass trunk-first evidence-driven CD system.
Each stage must produce:

1. Current-state technical map (jobs/scripts/contracts as implemented).
2. Farley alignment assessment (explicit pass/fail).
3. Recommendations (`must`/`should`/`could`) with impact and verification.
4. Decision log updates before the next stage starts.

This runbook is authoritative for the collaborative review loop.

## Scope

- In scope: cloud delivery lane.
- Out of scope: desktop delivery lane.

Primary artifacts:

- `package.json`
- `.github/workflows/commit-stage.yml`
- `.github/workflows/integration-gate.yml`
- `.github/workflows/cloud-deployment-pipeline.yml`
- `.github/policy/pipeline-policy.json`
- `tests/policy/test-policy.json`

## Farley Evaluation Criteria

1. Small batch integration on trunk.
2. Fast deterministic commit-stage feedback.
3. Build once, promote immutable release candidates.
4. Wide and fast pipeline with risk-appropriate evidence.
5. Deployment and release decision decoupled.
6. Fail-closed gates with rapid red-main recovery.
7. Evidence over opinion (machine-verifiable artifacts).

## Stage Tracker

| Stage | Name                                       | Status  | Entry Criteria   | Exit Criteria                                                            |
| ----- | ------------------------------------------ | ------- | ---------------- | ------------------------------------------------------------------------ |
| A     | Developer Entry + Pre-Commit Evidence      | closed  | Runbook approved | Closed: two-command local gate model (`test:quick`, `test:full`) adopted |
| B     | Commit-Stage Gate                          | pending | Stage A closed   | Agreement on commit-stage decision contract and blocking semantics       |
| C     | Integration Gate                           | pending | Stage B closed   | Agreement on integration evidence set and scope rules                    |
| D     | Build Once + Release Candidate Integrity   | pending | Stage C closed   | Agreement on immutable candidate and no-rebuild promotion guarantees     |
| E     | Automated Acceptance Test Gate             | pending | Stage D closed   | Agreement on scope-required acceptance checks and YES/NO rules           |
| F     | Deployment Stage + Production Verification | pending | Stage E closed   | Agreement on production decision contract and verification completeness  |
| G     | Release Decision + Feedback Loops          | pending | Stage F closed   | Agreement on KPIs, governance cadence, and continuous improvement loop   |

## Stage Workflow (Do Not Skip)

1. Map current implementation exactly.
2. Score against Farley criteria.
3. Propose prioritized recommendations.
4. Capture explicit accept/reject/defer decisions.
5. Record carry-forward constraints.
6. Start next stage only after exit criteria are satisfied.

## Stage A - Developer Entry + Pre-Commit Evidence

### A1. Current-State Technical Map

| Control Point                | Current Behavior                                                                                                | Source                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Quick local gate (canonical) | `pnpm test:quick` runs static policy checks + unit/component + contract drift checks.                           | `package.json`                                        |
| Alias behavior               | `pnpm test` is an alias to `pnpm test:quick` for compatibility.                                                 | `package.json`                                        |
| Full local gate              | `pnpm test:full` runs backend preflight first, then `test:quick` + integration + Playwright smoke (`test:e2e`). | `package.json`, `scripts/dev/test-full-preflight.mjs` |
| Pre-commit hook              | `.githooks/pre-commit` runs `pnpm test:quick`.                                                                  | `.githooks/pre-commit`, `package.json`                |
| Pre-push hook                | `.githooks/pre-push` runs `pnpm test:full`.                                                                     | `.githooks/pre-push`, `package.json`                  |
| Contract drift enforcement   | `contract:check` remains inside `test:quick`, so drift blocks both pre-commit and pre-push.                     | `package.json`                                        |
| Specialist commands          | `test:integration`, `test:e2e`, and policy scripts remain available for CI and troubleshooting.                 | `package.json`                                        |

### A2. Farley Alignment Assessment

| Criterion                               | Status | Evidence                                                                | Notes                                                       |
| --------------------------------------- | ------ | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| Small batch trunk integration           | pass   | Uniform local path: quick gate on commit, deep gate on push.            | Simpler default behavior reduces ambiguity.                 |
| Fast deterministic feedback             | pass   | `test:quick` is the default local loop and is deterministic.            | Faster than running a full static gate at both hook points. |
| Build once/promote immutable artifact   | n/a    | Not a Stage A concern.                                                  | Evaluated in Stage D.                                       |
| Wide and fast risk-appropriate evidence | pass   | `test:full` adds integration and e2e depth at pre-push boundary.        | Deep evidence preserved while inner loop stays simpler.     |
| Deploy/release decoupling               | n/a    | Not a Stage A concern.                                                  | Evaluated in Stage F/G.                                     |
| Fail-closed gates and recovery          | pass   | Hook gates fail closed and enforce quality before push.                 | Red-main recovery evaluated in Stage G.                     |
| Evidence over opinion                   | pass   | Policy + test contracts remain machine-enforced in the quick/full path. | Maintains evidence discipline with fewer command surfaces.  |

### A3. Stage A Recommendation Resolution

| Recommendation ID | Outcome    | Implementation                                                                                                                                        |
| ----------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-001             | accepted   | Replaced dual-static hook model with tiered hooks: pre-commit `test:quick`, pre-push `test:full`.                                                     |
| A-002             | accepted   | Kept `contract:check` inside `test:quick` so contract drift blocks both quick and full gates.                                                         |
| A-003             | accepted   | Set simple Stage A SLO guidance in docs: quick gate target "few minutes", hard cap 10 minutes; full gate is allowed longer but tracked and optimized. |
| A-004             | superseded | Replaced change-class matrix with universal two-command policy (`test:quick`, `test:full`).                                                           |

### A4. Default Stage A Command Contract

1. Iterate with `pnpm test:quick` (or `pnpm test` alias).
2. Before push, run `pnpm test:full`.
3. Use specialist commands only for troubleshooting and CI parity investigation.

### A5. Stage A Carry-Forward Constraints (For Stage B)

1. `commit-stage` remains the authoritative fast deterministic gate on `main`.
2. `test:full` is the local deep-confidence gate before push.
3. CI workflows remain the source of truth for promotion and release decisions.
4. Simplicity is prioritized in local commands; enforcement remains strict in CI.

### A6. Stage A Exit Criteria Status

1. `A-001` through `A-004` are resolved in the decision log.
2. Carry-forward constraints are documented in this runbook and decision log.
3. The Stage A local command contract is explicit and simplified.

## Stage B Through Stage G

Not started by design. Start each stage only after prior stage exit criteria is satisfied and decision log is updated.

## External Farley Anchors

- [Continuous Delivery: Ten Key Principles](https://www.continuousdelivery.com/2010/08/continuous-delivery-ten-key-principles/)
- [Patterns in Continuous Delivery](https://www.continuousdelivery.com/2011/04/patterns-in-continuous-delivery/)
- [What is Continuous Delivery?](https://www.continuousdelivery.com/2013/07/what-is-continuous-delivery/)
- [Anti-Patterns in Continuous Deployment](https://www.continuousdelivery.com/2023/07/anti-patterns-in-continuous-deployment/)
- [Barriers to Trunk-Based Development (Dave Farley)](https://www.davefarley.net/?p=247)
- [Don't Use Feature Branches (Dave Farley)](https://www.davefarley.net/?p=265)
