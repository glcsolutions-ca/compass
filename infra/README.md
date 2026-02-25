# Infrastructure

## Purpose

This directory defines production infrastructure delivery for Compass.

- `infra/azure/`: Azure platform/runtime resources (network, ACA, ACR, Postgres)
- `infra/identity/`: Entra app registrations, service principals, and federation wiring

## Workflow Topology

1. `commit-stage.yml` runs fast non-mutating checks and scope classification.
2. `cloud-delivery-pipeline.yml` runs acceptance checks (`infra-readonly-acceptance`, `identity-readonly-acceptance`) against one release package.
3. `cloud-delivery-pipeline.yml` runs production mutation (`deploy-release-package`) only when acceptance is YES and deploy is required.
4. `cloud-delivery-replay.yml` reruns acceptance -> production verification for an existing `release_package_sha`.

## Evidence Artifacts

- `.artifacts/release-package/<sha>/manifest.json`
- `.artifacts/infra/<sha>/`
- `.artifacts/identity/<sha>/`
- `.artifacts/acceptance/<sha>/`
- `.artifacts/production/<sha>/`
- `.artifacts/release/<sha>/decision.json`

## Safety Boundaries

Treat these as high risk and fail closed by default:

- `infra/**`
- production-mutating workflows under `.github/workflows/**`
- deploy/infra scripts under `scripts/pipeline/**`
- auth and identity config used by production delivery

## References

- Azure runtime/platform changes: [`infra/azure/README.md`](./azure/README.md)
- Entra identity changes: [`infra/identity/README.md`](./identity/README.md)
- Cloud pipeline setup: [`docs/runbooks/cloud-deployment-pipeline-setup.md`](../docs/runbooks/cloud-deployment-pipeline-setup.md)
