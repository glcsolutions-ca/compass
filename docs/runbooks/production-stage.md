# Production Stage Runbook

## Purpose

Run deterministic production promotion for an accepted release candidate on `main`.

Production stage must deploy accepted candidate digest refs and must not rebuild runtime images.

## Stage Topology

1. `commit-stage.yml` (PR + merge queue + `main`) produces merge safety evidence and a candidate manifest on `main`.
2. `acceptance-stage.yml` validates that candidate and returns one YES/NO gate.
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
  - `load-approved-candidate`
  - `freshness-check`
  - `deploy-approved-candidate`
  - `production-blackbox-verify`
  - `production-stage`
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
- `API_IDENTIFIER_URI` (canonical identity URI, `api://...` format)
- `ENTRA_AUDIENCE` (legacy fallback during transition)
- plus infra parameter vars documented in `infra/azure/README.md`

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

Optional acceptance-only credentials (recommended for least privilege):

- `AZURE_ACCEPTANCE_CLIENT_ID`
- `AZURE_ACCEPTANCE_IDENTITY_CLIENT_ID`

## Candidate and Config Contracts

Production stage consumes acceptance evidence under:

- `.artifacts/acceptance/<sha>/evidence-manifest.json`

Required acceptance evidence fields:

- `headSha`
- `changeClass`
- `scope.*`
- `candidate.apiRef` and `candidate.webRef` (ACR digest refs for runtime/infra paths)
- `checks.acceptanceStage` (`success` for required candidates, `not-required` for docs-only)

Identity config preflight contract (shared with acceptance):

- resolve `API_IDENTIFIER_URI` first, fallback `ENTRA_AUDIENCE`
- fail if both are set and differ
- fail if resolved value is not `api://...`

## Production Sequence

1. Load approved candidate evidence.
2. Run freshness check for auto-triggered promotions.
3. Run identity config preflight and identity apply when `identity` scope is true.
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

## Incident Note (2026-02-24)

Observed behavior:

- `Commit Stage` and `Acceptance Stage` passed for SHA `08d5bf7c39d64e03ec27eab01c4894c65fe85e9b`.
- `Production Stage` failed during identity apply with Graph `400 Bad Request`.

Root cause:

- Identity input semantics were not validated early enough.
- A non-URI audience value attempted to mutate `azuread_application.api.identifier_uris`.

Prevention now in place:

- Terraform variable validation for `api_identifier_uri` in `infra/identity/variables.tf`.
- Shared identity config preflight (`scripts/pipeline/shared/validate-identity-config.mjs`) in acceptance and production.
- Acceptance evidence now carries config-contract verdicts and candidate-fidelity verdicts.

## Safety Notes

- Keep `production-stage.yml` deploy-only for runtime artifacts (no `docker build`/`docker push`).
- Keep freshness check fail-closed for auto promotions.
- Keep infra/identity mutation under `environment: production` and `production-mutation` lock.
