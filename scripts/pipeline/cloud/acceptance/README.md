# Cloud Acceptance Stage Scripts

## Purpose

`scripts/pipeline/cloud/acceptance/` contains cloud acceptance-stage gate logic used by `cloud-deployment-pipeline.yml`.

## Script Map

| Script                                       | Role                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `decide-acceptance-stage.mjs`                | Produces YES/NO acceptance decision from required acceptance check outcomes. |
| `decide-acceptance-stage-lib.mjs`            | Pure evaluator for required acceptance checks by scope.                      |
| `finalize-acceptance-stage.mjs`              | Finalizes acceptance decision and non-deploy reason/result artifacts.        |
| `runtime-acceptance-lib.mjs`                 | Shared candidate contract checks and shell runner for runtime acceptance.    |
| `run-runtime-api-system-acceptance.mjs`      | Candidate API smoke + system smoke black-box execution.                      |
| `run-runtime-browser-acceptance.mjs`         | Candidate browser evidence execution (flow-id aware).                        |
| `run-runtime-migration-image-acceptance.mjs` | Candidate migration-image smoke execution.                                   |
| `acceptance-blackbox-contract.test.mjs`      | Prevents acceptance smoke tests from importing `apps/**` internals.          |

## Artifact Contract

- `.artifacts/acceptance/<sha>/result.json`

Result payload includes:

- candidate ref contract verdict + reason codes
- identity config contract verdict + reason codes

## Change Safety

Acceptance scripts must remain non-mutating. They gate promotion of the frozen release candidate.
