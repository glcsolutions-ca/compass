# Operating Model

Compass uses a deterministic merge contract.

## Core Rules

1. Risk tier is computed from changed paths.
2. Required checks are computed from tier.
3. Evidence must match current head SHA and computed tier.
4. `risk-policy-gate` is the final required check and fails closed.

## Key Terms

- `SHA`: unique commit fingerprint. We tag images and artifacts with it for exact traceability.
- `Replay`: rerun infra/deploy on the same SHA to prove repeatability.

## Canonical Check Order

1. `risk-policy-preflight` (includes `docs-drift`)
2. `codex-review`
3. `ci-pipeline`
4. `browser-evidence` (conditional)
5. `harness-smoke` (conditional)
6. `risk-policy-gate`
