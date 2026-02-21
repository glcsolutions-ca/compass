# Merge Policy Contract

This repository enforces a deterministic merge contract defined in `.github/policy/merge-policy.json`.

## Objective

Every PR to `main` must be ship-safe:

1. Risk tier is computed from changed paths.
2. Required evidence is computed from the risk tier.
3. Merge is allowed only when evidence is present, successful, and matches the current head SHA.

## Single required branch-protection check

Branch protection requires only:

- `risk-policy-gate`

`risk-policy-gate` enforces all dynamic tier checks (`ci-pipeline`, `browser-evidence`, `harness-smoke`, `codex-review`) for the current head SHA.
`codex-review` enforcement is controlled by `reviewPolicy.codexReviewEnabled` in `.github/policy/merge-policy.json`.

## Deterministic tiers

- `t0`: low risk
- `t1`: core backend/shared logic
- `t2`: UI/user flow changes
- `t3`: high risk (`auth`, control plane, infra/deploy, migrations)

If multiple tiers match, highest tier wins.

## Deterministic order

1. `preflight`
2. `docs-drift`
3. `codex-review`
4. `ci-pipeline`
5. `browser-evidence` (conditional)
6. `harness-smoke` (conditional)
7. `risk-policy-gate` (final fail-closed enforcement)

## Bootstrap review mode

During bootstrap, `reviewPolicy.codexReviewEnabled` may be `false`:

- `codex-review` still runs and emits deterministic no-op artifacts.
- `risk-policy-gate` does not require `codex-review` in required checks.

When `codex-review` is enabled but `OPENAI_API_KEY` is missing, `codex-review` emits a deterministic
bootstrap no-op artifact instead of failing.

When ready, enable blocking review by:

1. Adding repository secret `OPENAI_API_KEY`.
2. Setting `reviewPolicy.codexReviewEnabled` to `true`.

## Docs drift

`docs-drift` is always evaluated and blocking when either condition is true and docs were not updated:

- Changes match `docsDriftRules.blockingPaths`
- Changes match `docsDriftRules.docsCriticalPaths`

Accepted docs updates are defined in `docsDriftRules.docTargets`.

## Stale evidence rules

Evidence is valid only when:

- `headSha` matches current PR head SHA
- `tier` matches preflight-computed tier for that head SHA

## Flow

```mermaid
flowchart TD
  A["PR opened or synchronized"] --> B["preflight"]
  B --> C["docs-drift"]
  C --> D["codex-review"]
  D --> E["ci-pipeline"]
  D --> F{"browser-evidence required?"}
  D --> G{"harness-smoke required?"}
  F -- Yes --> H["browser-evidence"]
  G -- Yes --> I["harness-smoke"]
  E --> J["risk-policy-gate"]
  H --> J
  I --> J
  J --> K{"all required checks valid for current head SHA?"}
  K -- No --> X["fail closed"]
  K -- Yes --> M["merge eligible"]
```
