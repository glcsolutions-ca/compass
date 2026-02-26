# Cloud Pipeline Farley Review Decision Log

Track accepted/rejected recommendations and carry-forward constraints across stages.

## Conventions

- `status`: `pending`, `accepted`, `rejected`, `deferred`, `superseded`.
- `carry-forward constraints`: decisions that become mandatory inputs for later stages.

## Decisions

| Date       | Stage   | Decision ID | Decision                                                                                                         | Status     | Rationale                                                                                       | Carry-Forward Constraints                                                                                         |
| ---------- | ------- | ----------- | ---------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 2026-02-26 | Stage A | A-001       | Replace dual-static hook model with tiered local gates: pre-commit `pnpm test:quick`, pre-push `pnpm test:full`. | accepted   | Simplifies defaults while preserving strict fail-closed enforcement at push boundary.           | Stage B should assume `test:quick` is the canonical local fast gate and `test:full` is the deep gate.             |
| 2026-02-26 | Stage A | A-002       | Keep `contract:check` inside `pnpm test:quick` so contract drift blocks both local gates.                        | accepted   | Preserves contract integrity in the simplified model without additional command complexity.     | Stage B/C may assume contract drift is already prevented before push in the common developer workflow.            |
| 2026-02-26 | Stage A | A-003       | Adopt simple documented Stage A SLO targets for `test:quick` and `test:full` (no new local gate framework).      | accepted   | Keeps speed objective explicit while avoiding additional framework complexity in Stage A.       | Stage B should treat local gate speed as a monitored objective and escalate if `test:quick` drifts high.          |
| 2026-02-26 | Stage A | A-004       | Replace change-class command matrix with a universal two-command policy (`test:quick`, `test:full`).             | superseded | Two-command policy is easier to reason about and aligns with Farley-style stage simplification. | Stage B/C recommendations must not reintroduce path-based local command matrices unless risk evidence demands it. |
