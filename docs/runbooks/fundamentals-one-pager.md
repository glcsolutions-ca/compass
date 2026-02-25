# Compass Fundamentals Playbook (One Page)

Use this as the default operating reference. If this page and behavior disagree, behavior wins and this page must be updated.

## What You Are Running

- Web: React Router framework mode SPA (`ssr: false`) in `apps/web`.
- API: Express in `apps/api`.
- Worker: Express-hosted Service Bus worker in `apps/worker`.
- Retained surfaces: `apps/codex-app-server` and `apps/desktop` remain active.

## Runtime Contract (Current Baseline)

- API endpoints: `GET /health`, `GET /openapi.json`, `GET /v1/ping`
- Web API base URL: `VITE_API_BASE_URL`
- Worker queue contract:
  - `SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE`
  - `SERVICE_BUS_QUEUE_NAME`
  - `AZURE_CLIENT_ID`
  - `WORKER_RUN_MODE`

Service Bus is managed identity only. Do not use `AZURE_SERVICE_BUS_CONNECTION_STRING`.

## Non-Negotiables

1. `main` stays green and releasable.
2. Push small, reversible changes.
3. No manual cloud drift outside IaC/pipeline convergence.
4. No runtime reintroduction of connection-string auth for Service Bus.
5. Update docs in the same change when runtime/pipeline contracts change.

## Daily Change Flow

1. Implement the smallest useful change.
2. Run local gate: `pnpm test:static`
3. Run confidence gate: `pnpm test`
4. Push to `main`.
5. Watch workflows:
   - `Commit Stage`
   - `Integration Gate`
   - `Cloud Deployment Pipeline`
   - `Desktop Deployment Pipeline` (when in scope)

## How Releases Actually Happen

- Pipeline builds/loads a release candidate.
- Acceptance lanes decide if deployment is required and allowed.
- Production deploy lanes run only when scope and acceptance require mutation.
- Release decision is binary (`YES`/`NO`) and is the source of truth.

## Fast Triage

- Missing env variable errors:
  - Check GitHub environment vars/secrets first (`acceptance`, `production`).
  - Validate against `docs/runbooks/cloud-deployment-pipeline-setup.md`.

- `verify-worker-servicebus-cutover` fails:
  - Confirm both namespaces have `disableLocalAuth=true`.
  - Confirm worker app has MI envs (`SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE`, `AZURE_CLIENT_ID`) and no connection-string env/secret.
  - Confirm worker runtime identity has `Azure Service Bus Data Receiver` on queue scope.

- Deploy unexpectedly skipped:
  - Check scope outputs (`runtime_changed`, `infra_changed`, `requires_infra_convergence`).
  - Check automated acceptance decision (`YES` required for deploy).

## Fix Strategy

- Config/RBAC/DNS issue with same artifact: replay the accepted SHA.
- Code/workflow issue: fix forward on `main` with a new commit.

## Canonical References

- Cloud pipeline setup: `docs/runbooks/cloud-deployment-pipeline-setup.md`
- Foundation baseline: `docs/architecture/foundation-baseline.md`
- Testing strategy: `tests/README.md`
- Agent workflow map: `AGENTS.md`
