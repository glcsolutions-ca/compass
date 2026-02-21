# Operating Model

Compass uses a deterministic merge contract.

## Core Rules

1. Risk tier is computed from changed paths.
2. Required checks are computed from tier.
3. Evidence must match current head SHA and computed tier.
4. `risk-policy-gate` is the final required check and fails closed.

## Canonical Check Order

1. `preflight`
2. `docs-drift`
3. `codex-review`
4. `ci-pipeline`
5. `browser-evidence` (conditional)
6. `harness-smoke` (conditional)
7. `risk-policy-gate`
