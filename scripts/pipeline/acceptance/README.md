# Acceptance Stage Scripts

## Purpose

`scripts/pipeline/acceptance/` contains acceptance-stage gate logic used by `acceptance-stage.yml`.

## Script Map

| Script                          | Role                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `acceptance-stage-gate.mjs`     | Produces YES/NO acceptance decision from required acceptance check outcomes. |
| `acceptance-stage-gate-lib.mjs` | Pure evaluator for required acceptance checks by scope.                      |

## Artifact Contract

- `.artifacts/acceptance/<sha>/result.json`
- `.artifacts/acceptance/<sha>/evidence-manifest.json`

## Change Safety

Acceptance scripts must remain non-mutating. They gate promotion of the frozen release candidate.
