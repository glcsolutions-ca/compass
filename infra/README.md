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

Do not commit organization-specific production values in tracked IaC files or documentation examples. This includes:

- tenant IDs, subscription IDs, resource group names
- production app/job names and DNS hostnames
- private DNS zone names and server FQDNs
- concrete issuer/JWKS tenant URLs for a specific organization
- production GitHub organization/repository slugs used for identity trust wiring

Store concrete production values only in GitHub `production` environment `vars`/`secrets`.

## Workflow Topology

The main workflows and their boundaries:

1. `identity-plan` validates and plans `infra/identity/**` changes for pull requests and manual runs.
2. `identity-apply` is manual and mutates Entra identity state using Terraform.
3. `infra-apply` is manual or workflow-call based and mutates Azure resource state via Bicep.
4. `deploy` is the mainline release orchestrator. It runs checks/promote logic and can call `infra-apply` when infra convergence is required.

## Replay and Determinism

Replay is part of the operating model:

- Infra replay: rerun `infra-apply` on the same SHA to verify idempotent convergence.
- Deploy replay: rerun `deploy` on the same SHA to verify deterministic promotion behavior.

Both replays are expected to fail closed on drift, invalid environment configuration, or missing evidence.

## Evidence Artifacts

Primary infrastructure evidence roots:

- `.artifacts/infra/<sha>/` for Bicep runtime parameters, deployment results, and retry diagnostics.
- `.artifacts/identity/<sha>/` for Terraform plan/apply outputs.

## Where To Change What

- Azure runtime/platform resource changes: [`infra/azure/README.md`](./azure/README.md)
- Entra identity and federation changes: [`infra/identity/README.md`](./identity/README.md)
- Mainline release orchestration behavior: [`docs/runbooks/deploy-aca.md`](../docs/runbooks/deploy-aca.md)
- ACR production strategy rationale: [`docs/adr/TDR-002-production-container-registry-strategy.md`](../docs/adr/TDR-002-production-container-registry-strategy.md)

## Safety Boundaries

Treat the following as high risk and fail closed by default:

- any change under `infra/**`
- production-mutating workflows under `.github/workflows/**`
- deploy/infra control scripts under `scripts/deploy/**` and `scripts/infra/**`
- authentication and identity contracts used by production release paths

Use small PRs, preserve one intent per change, and keep rollout/rollback steps explicit.
