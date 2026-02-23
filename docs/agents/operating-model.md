# Operating Model

Compass uses a deterministic merge contract.

## Core Rules

1. Risk tier is computed from changed paths.
2. Required checks are computed from tier.
3. Evidence must match current head SHA, tested merge SHA, and computed tier.
4. `risk-policy-gate` is the final required check and fails closed.

## Key Terms

- `SHA`: unique commit fingerprint. We tag images and artifacts with it for exact traceability.
- `Replay`: rerun infra/deploy on the same SHA to prove repeatability.

## Canonical Check Dependencies

1. `risk-policy-preflight` runs first (includes `docs-drift`).
2. `ci-pipeline` always runs from preflight outputs (`fast` for `low`, `full` for `standard/high`).
3. `browser-evidence` and `harness-smoke` run conditionally in parallel.
4. `risk-policy-gate` is final and validates required `needs.*.result` outcomes.
