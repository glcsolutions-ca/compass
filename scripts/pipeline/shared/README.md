# Shared Pipeline Scripts

## Purpose

`scripts/pipeline/shared/` contains reusable helpers for all three delivery stages.

## Script Map

| Script                                | Role                                                                 |
| ------------------------------------- | -------------------------------------------------------------------- |
| `pipeline-utils.mjs`                  | Shared env, file, policy, and artifact utilities.                    |
| `collect-stage-timing.mjs`            | Commit-stage timing collection and SLO telemetry artifact writer.    |
| `validate-identity-config.mjs`        | Identity config contract preflight (`API_IDENTIFIER_URI` semantics). |
| `workflow-pipeline-contract.test.mjs` | Structural regression checks for workflow contracts.                 |

## Artifact Contract

- Commit timing: `.artifacts/commit-stage/<sha>/timing.json`
- Identity config contract: `.artifacts/identity/<sha>/config-validation.json`

## Change Safety

Shared scripts are control-plane critical. Keep changes fail-closed and ensure all consuming workflows remain consistent.
