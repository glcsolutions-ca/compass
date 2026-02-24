# Shared Pipeline Scripts

## Purpose

`scripts/pipeline/shared/` contains reusable helpers for commit-stage and deployment pipeline orchestration.

## Script Map

| Script                                 | Role                                                                 |
| -------------------------------------- | -------------------------------------------------------------------- |
| `pipeline-utils.mjs`                   | Shared env, file, policy, and artifact utilities.                    |
| `collect-commit-stage-timing.mjs`      | Commit-stage timing collection and SLO telemetry artifact writer.    |
| `collect-deployment-stage-timing.mjs`  | Deployment-stage timing collection and bottleneck reporting.         |
| `validate-identity-config.mjs`         | Identity config contract preflight (`API_IDENTIFIER_URI` semantics). |
| `validate-infra-acceptance-config.mjs` | Infra acceptance env/provider semantic contract checks.              |
| `resolve-triggered-run-id.mjs`         | Resolve source run IDs for replay candidate loading.                 |
| `load-release-candidate-contract.mjs`  | Parse and validate release-candidate manifest contract.              |
| `resolve-stage-eligibility.mjs`        | Stage deploy-required and control-plane eligibility resolution.      |
| `decide-release-outcome.mjs`           | Canonical release YES/NO decision artifact writer.                   |
| `freeze-release-candidate-refs.mjs`    | Freeze runtime candidate refs (build/push or current ref digesting). |
| `render-infra-parameters.mjs`          | Render Bicep parameter JSON from environment variables.              |
| `workflow-pipeline-contract.test.mjs`  | Structural regression checks for workflow contracts.                 |

## Artifact Contract

- Commit timing: `.artifacts/commit-stage/<sha>/timing.json`
- Deployment timing: `.artifacts/pipeline/<sha>/timing.json`
- Identity config contract: `.artifacts/identity/<sha>/config-validation.json`
- Release decision: `.artifacts/release/<sha>/decision.json`

## Change Safety

Shared scripts are control-plane critical. Keep changes fail-closed and ensure all consuming workflows remain consistent.
