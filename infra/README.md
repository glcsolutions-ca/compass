# Infrastructure

## Purpose

This directory is the production infrastructure control plane for Compass.
It is intentionally split:

- `azure/` provisions Azure platform/runtime resources (network, ACA, ACR, Postgres).
- `identity/` provisions Microsoft Entra app identities and federation wiring.

## Directory Map

| Path              | Responsibility                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| `infra/azure/`    | Bicep templates and modules for production platform resources.                                          |
| `infra/identity/` | Terraform (`azuread`) stack for Entra app registrations, service principals, and federated credentials. |

## Non-Commit Policy

Do not commit organization-specific production values in tracked IaC files or documentation examples.
Concrete production values belong only in GitHub `production` environment `vars`/`secrets`.

## Workflow Topology

Infrastructure flows through the 3-stage delivery pipeline:

1. `commit-stage.yml` performs fast non-mutating checks and scope classification on PR/merge queue.
2. `mainline-pipeline.yml` runs acceptance jobs (`infra-readonly-acceptance`, `identity-readonly-acceptance`) against the frozen candidate.
3. `mainline-pipeline.yml` performs guarded production mutation (`deploy-approved-candidate`) when required, with `approve-control-plane` for infra/identity control-plane scopes.

## Replay and Determinism

Replay is part of the operating model:

- Replay via `mainline-pipeline.yml` `workflow_dispatch` with `candidate_sha=<sha>`.

Both replays are expected to fail closed on drift, invalid environment configuration, or missing evidence.

## Evidence Artifacts

Primary infrastructure evidence roots:

- `.artifacts/infra/<sha>/` for Bicep parameters, validation/apply results, and diagnostics.
- `.artifacts/identity/<sha>/` for Terraform plan/apply outputs.
- `.artifacts/acceptance/<sha>/` and `.artifacts/production/<sha>/` for stage-level evidence.
- `.artifacts/release/<sha>/decision.json` for canonical release YES/NO verdict.

## Where To Change What

- Azure runtime/platform resource changes: [`infra/azure/README.md`](./azure/README.md)
- Entra identity and federation changes: [`infra/identity/README.md`](./identity/README.md)
- Production release orchestration behavior: [`docs/runbooks/production-stage.md`](../docs/runbooks/production-stage.md)
- ACR production strategy rationale: [`docs/adr/TDR-002-production-container-registry-strategy.md`](../docs/adr/TDR-002-production-container-registry-strategy.md)

## Safety Boundaries

Treat the following as high risk and fail closed by default:

- any change under `infra/**`
- production-mutating workflows under `.github/workflows/**`
- deploy/infra control scripts under `scripts/pipeline/**`
- authentication and identity contracts used by production release paths

Use small PRs, preserve one intent per change, and keep rollout/rollback steps explicit.
