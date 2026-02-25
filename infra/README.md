# Infrastructure

## Purpose

This directory defines production infrastructure delivery for Compass.

- `infra/azure/`: Azure platform/runtime resources (network, ACA, ACR, Postgres)
- `infra/identity/`: Entra app registrations, service principals, and federation wiring

## Workflow Topology

1. `commit-stage.yml` runs fast non-mutating checks and scope classification.
2. `cloud-deployment-pipeline.yml` runs automated acceptance test gate checks (`infra-readonly-acceptance`, `identity-readonly-acceptance`) against one release candidate.
3. `cloud-deployment-pipeline.yml` runs deployment-stage mutation (`deploy-release-candidate`) only when the automated acceptance test gate is YES and deployment is required.
4. `cloud-deployment-pipeline-replay.yml` reruns automated-acceptance-test-gate -> deployment-stage verification for an existing `release_candidate_sha`.

## Evidence Artifacts

- `.artifacts/release-candidate/<sha>/manifest.json`
- `.artifacts/infra/<sha>/`
- `.artifacts/identity/<sha>/`
- `.artifacts/automated-acceptance-test-gate/<sha>/`
- `.artifacts/deployment-stage/<sha>/`
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
