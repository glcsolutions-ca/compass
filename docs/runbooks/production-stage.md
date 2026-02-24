# Production Stage Runbook

## Purpose

Run deterministic production promotion for an accepted release candidate on `main`.

Production stage must deploy the accepted candidate digest refs and must not rebuild runtime images.

## Stage Topology

1. `commit-stage.yml` (PR + merge queue + `main`) produces merge safety evidence and a candidate manifest on `main`.
2. `acceptance-stage.yml` validates that candidate and returns one yes/no gate.
3. `production-stage.yml` deploys the accepted candidate with production safeguards.

## Non-Commit Rule

Do not commit organization-specific infrastructure values in this repository.
All concrete production values must be stored in the GitHub `production` environment (`vars` and `secrets`).

## Workflow

- Workflow file: `.github/workflows/production-stage.yml`
- Trigger:
  - `workflow_run` from successful `Acceptance Stage`
  - `workflow_dispatch` replay by `candidate_sha`
- Job model:
  - `load-accepted-candidate`
  - `stale-guard`
  - `production-mutate`
  - `post-deploy-verify`
  - `production-stage-result`
- Concurrency: production mutation is serialized by `concurrency: production-mutation` (`cancel-in-progress: false`).
- GitHub environment: `production`.

## Required GitHub Environment Variables (`production`)

- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_RESOURCE_GROUP`
- `ACA_API_APP_NAME`
- `ACA_WEB_APP_NAME`
- `ACA_MIGRATE_JOB_NAME`
- `ACR_NAME`
- plus infra parameter vars documented in `infra/azure/README.md`

Optional custom domain vars:

- `ACA_API_CUSTOM_DOMAIN`
- `ACA_WEB_CUSTOM_DOMAIN`
- `ACA_API_MANAGED_CERTIFICATE_NAME`
- `ACA_WEB_MANAGED_CERTIFICATE_NAME`
- `ACA_CUSTOM_DOMAIN_VALIDATION_METHOD` (`CNAME|HTTP|TXT`)

## Required GitHub Environment Secrets (`production`)

- `AZURE_DEPLOY_CLIENT_ID`
- `AZURE_IDENTITY_CLIENT_ID`
- `POSTGRES_ADMIN_PASSWORD`

## Candidate Contract

Production stage consumes acceptance evidence under:

- `.artifacts/acceptance/<sha>/evidence-manifest.json`

Required fields:

- `headSha`
- `kind`
- `scope.*`
- `candidate.apiRef` and `candidate.webRef` (ACR digest refs for infra/runtime paths)
- `checks.acceptanceStageGate = success`

## Production Sequence

1. Load accepted candidate evidence.
2. Run stale-head guard for auto-triggered promotions.
3. Run identity apply when `identity` scope is true.
4. Run infra apply when `infra` scope is true or runtime requires infra convergence.
5. For runtime:
   - update migration job image to accepted API digest
   - run migration job when required
   - deploy API and Web using accepted digest refs
6. Run API smoke and browser smoke.
7. Record successful deployment in GitHub Deployments.

## Replay and Rollback

- Manual replay: run `production-stage.yml` with `candidate_sha`.
- Replay uses the same acceptance evidence/candidate refs.
- For runtime rollback, replay a previously accepted candidate SHA.

## Artifacts

- `.artifacts/production/<sha>/deployment-record.json`
- `.artifacts/production/<sha>/result.json`
- `.artifacts/deploy/<sha>/*.json`
- `.artifacts/infra/<sha>/*`
- `.artifacts/identity/<sha>/*`
- `.artifacts/browser-evidence/<sha>/manifest.json`

## Safety Notes

- Keep `production-stage.yml` deploy-only for runtime artifacts (no `docker build`/`docker push`).
- Keep stale guard fail-closed for auto promotions.
- Keep infra/identity mutation under `environment: production` and `production-mutation` lock.
