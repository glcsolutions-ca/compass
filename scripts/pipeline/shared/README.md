# Shared Pipeline Scripts

## Purpose

`scripts/pipeline/shared/` contains reusable helpers for commit-stage, cloud delivery, and desktop delivery orchestration.

## Script Map

| Script                                    | Role                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `pipeline-utils.mjs`                      | Shared env, file, policy, and artifact utilities.                    |
| `collect-commit-stage-timing.mjs`         | Commit-stage timing collection and SLO telemetry writer.             |
| `collect-cloud-delivery-stage-timing.mjs` | Cloud delivery stage timing collection and bottleneck reporting.     |
| `verify-commit-stage-evidence.mjs`        | Verifies successful merge-gate evidence exists for release SHA.      |
| `validate-identity-config.mjs`            | Identity config contract preflight (`API_IDENTIFIER_URI` semantics). |
| `validate-infra-acceptance-config.mjs`    | Infra acceptance env/provider semantic contract checks.              |
| `resolve-triggered-run-id.mjs`            | Resolve source run IDs for manual replay artifact loading.           |
| `load-release-package-contract.mjs`       | Parse and validate release package manifest contract.                |
| `resolve-stage-eligibility.mjs`           | Stage deploy-required and delivery-config eligibility resolution.    |
| `decide-release-outcome.mjs`              | Canonical release YES/NO decision artifact writer.                   |
| `freeze-release-package-refs.mjs`         | Build or capture runtime release package digest refs.                |
| `render-infra-parameters.mjs`             | Render Bicep parameter JSON from environment variables.              |
| `workflow-pipeline-contract.test.mjs`     | Structural regression checks for workflow contracts.                 |

## Artifact Contract

- Commit timing: `.artifacts/commit-stage/<sha>/timing.json`
- Cloud delivery timing: `.artifacts/pipeline/<sha>/timing.json`
- Identity config contract: `.artifacts/identity/<sha>/config-validation.json`
- Release decision: `.artifacts/release/<sha>/decision.json`

## Change Safety

Shared scripts are high-risk delivery-config code. Keep changes fail-closed and keep all consuming workflows consistent.
