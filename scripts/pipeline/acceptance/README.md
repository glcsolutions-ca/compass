# Acceptance Stage Scripts

## Purpose

`scripts/pipeline/acceptance/` contains acceptance-stage gate logic used by `deployment-pipeline.yml`.

## Script Map

| Script                            | Role                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `decide-acceptance-stage.mjs`     | Produces YES/NO acceptance decision from required acceptance check outcomes. |
| `decide-acceptance-stage-lib.mjs` | Pure evaluator for required acceptance checks by scope.                      |

## Artifact Contract

- `.artifacts/acceptance/<sha>/result.json`

Result payload includes:

- candidate ref contract verdict + reason codes
- identity config contract verdict + reason codes

## Change Safety

Acceptance scripts must remain non-mutating. They gate promotion of the frozen release candidate.
