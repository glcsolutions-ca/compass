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
`codex-review` runs only when required by policy (`reviewPolicy.codexReviewEnabled` and tier requirements).
`risk-policy-gate` enforces required check-runs by result and validates browser evidence manifest assertions only when UI evidence is required.

## Deterministic tiers

- `t0`: low risk
- `deps`: dependency manifests/lockfiles only (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`)
- `t1`: core backend/shared logic
- `t2`: UI/user flow changes
- `t3`: high risk (`auth`, control-plane config like workflows/policy/dependabot, deploy scripts, infra, migrations)

If multiple tiers match, highest tier wins.

## Deterministic order

1. `risk-policy-preflight` (includes docs-drift evaluation)
2. `codex-review` (conditional)
3. `ci-pipeline-fast` or `ci-pipeline-full` (selected by tier)
4. `ci-pipeline` (aggregates lane result into one stable required check)
5. `browser-evidence` (conditional)
6. `harness-smoke` (conditional)
7. `risk-policy-gate` (final fail-closed enforcement)

## Tier Matrix

| Tier   | Mode   | Required checks                                                                   |
| ------ | ------ | --------------------------------------------------------------------------------- |
| `t0`   | `fast` | `risk-policy-gate`, `ci-pipeline`                                                 |
| `deps` | `full` | `risk-policy-gate`, `ci-pipeline`                                                 |
| `t1`   | `full` | `risk-policy-gate`, `ci-pipeline`                                                 |
| `t2`   | `full` | `risk-policy-gate`, `ci-pipeline`, `browser-evidence`                             |
| `t3`   | `full` | `risk-policy-gate`, `ci-pipeline`, `harness-smoke`, `codex-review` (when enabled) |

`ci-pipeline` remains the only required CI check name for branch protection. Internally:

- `ci-pipeline-fast` runs lightweight repo checks only.
- `ci-pipeline-full` runs Postgres-backed integration flow plus full pipeline checks.
- `ci-pipeline` validates that the correct lane ran and succeeded for the current `ci_mode`.

## Bootstrap review mode

During bootstrap, `reviewPolicy.codexReviewEnabled` may be `false`:

- `codex-review` is skipped (not required by gate).
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

`docs-drift` runs as part of `risk-policy-preflight` and still emits a standalone
artifact at `.artifacts/docs-drift/<headSha>/result.json`.

## Stale evidence rules

Evidence is valid only when:

- `headSha` matches current PR head SHA
- `tier` matches preflight-computed tier for that head SHA

## Runtime baseline

Control-plane scripts (`preflight`, `docs-drift`, `codex-review`, `gate`, deploy scripts) rely on Node core APIs only.
Workflow and local contract checks require Node `24` with minimum `24.8.0` (for `path.posix.matchesGlob`), sourced from `.nvmrc`.

## Control-Plane Paths

The following paths are treated as explicit control-plane surfaces and are elevated to high-risk:

- `.github/workflows/*.yml`
- `.github/workflows/*.yaml`
- `.github/policy/**`
- `scripts/ci/**`
- `scripts/deploy/**`
- `scripts/infra/**`
- `infra/azure/**`
- `infra/identity/**`
- `deploy/**`

## Flow

```mermaid
flowchart TD
  A["PR opened or synchronized"] --> B["risk-policy-preflight (+ docs-drift)"]
  B --> D{"codex-review required?"}
  D -- Yes --> DR["codex-review"]
  B --> E{"ci_mode"}
  E -- fast --> EF["ci-pipeline-fast"]
  E -- full --> EL["ci-pipeline-full"]
  EF --> EA["ci-pipeline (aggregator)"]
  EL --> EA["ci-pipeline (aggregator)"]
  B --> F{"browser-evidence required?"}
  B --> G{"harness-smoke required?"}
  F -- Yes --> H["browser-evidence"]
  G -- Yes --> I["harness-smoke"]
  DR --> J["risk-policy-gate"]
  EA --> J["risk-policy-gate"]
  H --> J
  I --> J
  J --> K{"all required checks valid for current head SHA?"}
  K -- No --> X["fail closed"]
  K -- Yes --> M["merge eligible"]
```
