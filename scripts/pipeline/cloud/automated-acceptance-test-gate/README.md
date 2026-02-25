# Cloud Automated Acceptance Test Gate Scripts

## Purpose

`scripts/pipeline/cloud/automated-acceptance-test-gate/` contains cloud automated-acceptance-test-gate gate logic used by `cloud-deployment-pipeline.yml` and `cloud-deployment-pipeline-replay.yml`.

## Script Map

| Script                                          | Role                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------- |
| `decide-automated-acceptance-test-gate.mjs`     | Produces YES/NO acceptance decision from required acceptance check outcomes.  |
| `decide-automated-acceptance-test-gate-lib.mjs` | Pure evaluator for required acceptance checks by scope.                       |
| `finalize-automated-acceptance-test-gate.mjs`   | Finalizes acceptance decision and non-deploy reason/result artifacts.         |
| `runtime-acceptance-lib.mjs`                    | Shared release-candidate contract checks and shell runner for runtime checks. |
| `run-runtime-api-system-acceptance.mjs`         | Release-candidate API smoke + system smoke black-box execution.               |
| `run-runtime-browser-acceptance.mjs`            | Release-candidate browser evidence execution (flow-id aware).                 |
| `run-runtime-migration-image-acceptance.mjs`    | Release-candidate migration-image smoke execution.                            |
| `acceptance-blackbox-contract.test.mjs`         | Prevents acceptance smoke tests from importing `apps/**` internals.           |

## Artifact Contract

- `.artifacts/automated-acceptance-test-gate/<sha>/result.json`

Result payload includes:

- release candidate ref contract verdict + reason codes
- identity config contract verdict + reason codes

## Change Safety

Acceptance scripts must remain non-mutating. They gate promotion of the frozen release candidate.
