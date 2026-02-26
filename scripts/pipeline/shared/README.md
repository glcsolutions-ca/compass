# Shared Pipeline Scripts

## Purpose

`scripts/pipeline/shared/` contains reusable helpers for commit-stage, cloud deployment pipeline, and desktop delivery orchestration.

## Script Map

| Script                                      | Role                                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pipeline-utils.mjs`                        | Shared env, file, policy, and artifact utilities.                                              |
| `collect-commit-stage-timing.mjs`           | Commit-stage timing collection and SLO telemetry writer.                                       |
| `collect-integration-gate-metrics.mjs`      | Integration-gate throughput snapshot (run wait, pass rates, rerun ratio).                      |
| `collect-cloud-deployment-stage-timing.mjs` | Cloud deployment stage timing collection and bottleneck reporting.                             |
| `verify-commit-stage-evidence.mjs`          | Verifies successful commit-stage evidence exists for the release SHA.                          |
| `verify-integration-gate-evidence.mjs`      | Verifies successful integration-gate evidence exists for the release SHA.                      |
| `validate-identity-config.mjs`              | Identity config contract preflight (`API_IDENTIFIER_URI` + `ACA_WEB_CUSTOM_DOMAIN` semantics). |
| `validate-infra-acceptance-config.mjs`      | Infra acceptance env/provider semantic contract checks.                                        |
| `resolve-triggered-run-id.mjs`              | Resolve source run IDs for manual replay artifact loading.                                     |
| `load-release-candidate-contract.mjs`       | Parse and validate release candidate manifest contract.                                        |
| `resolve-stage-eligibility.mjs`             | Stage deploy-required and deployment-pipeline-config eligibility resolution.                   |
| `decide-release-outcome.mjs`                | Canonical release YES/NO decision artifact writer.                                             |
| `freeze-release-candidate-refs.mjs`         | Capture current runtime release candidate digest refs from deployed ACA apps.                  |
| `render-infra-parameters.mjs`               | Render Bicep parameter JSON from environment variables.                                        |
| `workflow-pipeline-contract.test.mjs`       | Structural regression checks for workflow contracts.                                           |

## Artifact Contract

- Commit timing: `.artifacts/commit-stage/<sha>/timing.json`
- Integration gate timing: `.artifacts/integration-gate/<sha>/timing.json`
- Cloud deployment timing: `.artifacts/pipeline/<sha>/timing.json`
- Identity config contract: `.artifacts/identity/<sha>/config-validation.json`
- Release decision: `.artifacts/release/<sha>/decision.json`

## Change Safety

Shared scripts are high-risk deployment-pipeline-config code. Keep changes fail-closed and keep all consuming workflows consistent.

## Release-Candidate Image Build Notes

- Runtime image build/push is handled in `.github/workflows/cloud-deployment-pipeline.yml` with `docker/build-push-action@v6`.
- Build jobs use Buildx with GitHub cache backend (`cache-from/cache-to: type=gha`) and per-image cache scopes.
- `freeze-release-candidate-refs.mjs` is now resolve-only for the `resolve-current-runtime-refs` mode.
