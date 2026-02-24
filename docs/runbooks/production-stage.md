# Production Stage Runbook

## Purpose

Run deterministic cloud production promotion for an accepted release candidate on `main`.

Production stage must deploy accepted candidate digest refs and must not rebuild runtime images.

## Stage Topology

1. `commit-stage.yml` gates PR and merge queue with fast merge-blocking feedback.
2. `cloud-deployment-pipeline.yml` (Cloud Deployment Pipeline) runs on `push` to `main`.
3. Inside the Cloud Deployment Pipeline: commit checks -> candidate freeze -> acceptance (YES/NO) -> production -> release decision.

## Non-Commit Rule

Do not commit organization-specific infrastructure values in this repository.
All concrete production values must be stored in GitHub environments (`acceptance`, `production`, `production-control-plane`).

## Workflow

- Workflow file: `.github/workflows/cloud-deployment-pipeline.yml`
- Trigger:
  - `push` to `main`
  - `workflow_dispatch` replay by `candidate_sha`
- Production job model:
  - `approve-control-plane` (conditional)
  - `deploy-approved-candidate`
  - `production-blackbox-verify`
  - `production-stage`
  - `release-decision`
- Concurrency: production mutation is serialized by `concurrency: production-mutation` (`cancel-in-progress: false`).

Desktop deployables use a separate deployment pipeline:

- `.github/workflows/desktop-deployment-pipeline.yml`
- runbook: `docs/runbooks/desktop-deployment-pipeline.md`

## Environment Boundaries

- `acceptance`: non-mutating validation credentials only.
- `production-control-plane`: approval checkpoint for infra/identity/control-plane mutations.
- `production`: mutation credentials and deployment execution.

## Required GitHub Environment Variables (`production`)

- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_RESOURCE_GROUP`
- `ACA_API_APP_NAME`
- `ACA_WEB_APP_NAME`
- `ACA_MIGRATE_JOB_NAME`
- `ACR_NAME`
- `API_IDENTIFIER_URI` (canonical identity URI, `api://...` format)
- `ENTRA_AUDIENCE` (legacy fallback during transition)
- plus infra parameter vars documented in `infra/azure/README.md`
- API and Web Container App module sources are `infra/azure/modules/containerapp-api.bicep`
  and `infra/azure/modules/containerapp-web.bicep`; production expects these apps to keep
  at least one replica warm (`minReplicas: 1`).

Optional custom domain vars:

- `ACA_API_CUSTOM_DOMAIN`
- `ACA_WEB_CUSTOM_DOMAIN`
- `ACA_API_MANAGED_CERTIFICATE_NAME`
- `ACA_WEB_MANAGED_CERTIFICATE_NAME`
- `ACA_CUSTOM_DOMAIN_VALIDATION_METHOD` (`CNAME|HTTP|TXT`)

## Required GitHub Environment Secrets (`production`)

- `AZURE_DEPLOY_CLIENT_ID` (infra/runtime mutation)
- `AZURE_IDENTITY_CLIENT_ID` (identity mutation)
- `POSTGRES_ADMIN_PASSWORD`

Required acceptance environment secrets (read-only):

- `AZURE_ACCEPTANCE_CLIENT_ID`
- `AZURE_ACCEPTANCE_IDENTITY_CLIENT_ID`

## Candidate and Config Contracts

Cloud Deployment Pipeline loads candidate manifest contract from:

- `.artifacts/candidate/<sha>/manifest.json`

Production release verdict is written to:

- `.artifacts/release/<sha>/decision.json`

Identity config preflight contract (shared with acceptance):

- resolve `API_IDENTIFIER_URI` first, fallback `ENTRA_AUDIENCE`
- fail if both are set and differ
- fail if resolved value is not `api://...`

## Production Sequence

1. Use candidate digest refs from frozen manifest.
2. Require `approve-control-plane` only when `infra`, `identity`, or `requiresInfraConvergence` is true.
3. Run identity config preflight and identity apply when `identity` scope is true.
4. Run infra apply when `infra` scope is true or runtime requires infra convergence.
5. For runtime:
   - update migration job image to accepted API digest
   - run migration job when required
   - deploy API and Web using accepted digest refs
6. Run API smoke and browser smoke when runtime/infra convergence requires runtime verification.
7. Record deployment in GitHub Deployments.
8. Emit final release decision artifact (`YES`/`NO`).

## Replay and Rollback

- Manual replay: run `cloud-deployment-pipeline.yml` with `candidate_sha`.
- Replay uses the same candidate manifest and digest refs.
- For runtime rollback, replay a previously accepted candidate SHA.

## Artifacts

- `.artifacts/release/<sha>/decision.json`
- `.artifacts/candidate/<sha>/manifest.json`
- `.artifacts/production/<sha>/deployment-record.json`
- `.artifacts/production/<sha>/result.json`
- `.artifacts/deploy/<sha>/*.json`
- `.artifacts/infra/<sha>/*`
- `.artifacts/identity/<sha>/*`
- `.artifacts/browser-evidence/<sha>/manifest.json`

## Safety Notes

- Keep `cloud-deployment-pipeline.yml` deploy-only for runtime artifacts in production jobs (no `docker build`/`docker push` in production stage jobs).
- Keep infra/identity mutation under `environment: production` and `production-mutation` lock.
- Keep acceptance credentials read-only and isolated from production mutation credentials.
- Keep Container App `minReplicas` at `1` for API and Web to avoid cold-start regressions.
