# Shared Pipeline Scripts

## Purpose

`scripts/pipeline/shared/` contains reusable helpers for commit-stage and deployment pipeline orchestration.

## Script Map

| Script                                | Role                                                                 |
| ------------------------------------- | -------------------------------------------------------------------- |
| `pipeline-utils.mjs`                  | Shared env, file, policy, and artifact utilities.                    |
| `collect-commit-stage-timing.mjs`     | Commit-stage timing collection and SLO telemetry artifact writer.    |
| `validate-identity-config.mjs`        | Identity config contract preflight (`API_IDENTIFIER_URI` semantics). |
| `resolve-triggered-run-id.mjs`        | Resolve source run IDs for replay candidate loading.                 |
| `load-release-candidate-contract.mjs` | Parse and validate release-candidate manifest contract.              |
| `render-infra-parameters.mjs`         | Render Bicep parameter JSON from environment variables.              |
| `workflow-pipeline-contract.test.mjs` | Structural regression checks for workflow contracts.                 |

## Artifact Contract

- Commit timing: `.artifacts/commit-stage/<sha>/timing.json`
- Identity config contract: `.artifacts/identity/<sha>/config-validation.json`
- Release decision: `.artifacts/release/<sha>/decision.json`

## Change Safety

Shared scripts are control-plane critical. Keep changes fail-closed and ensure all consuming workflows remain consistent.
