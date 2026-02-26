# Workflows

## Delivery Model

1. `commit-stage.yml` runs on push to `main` (and optional PR preview).
2. `integration-gate.yml` runs on push to `main` (and optional PR preview).
3. `cloud-deployment-pipeline.yml` runs on push to `main`.
4. `cloud-deployment-pipeline-replay.yml` is manual (`workflow_dispatch`) and redeploys by release-candidate SHA.
5. `desktop-deployment-pipeline.yml` is independent of cloud runtime delivery.

## Cloud Runtime Path

`cloud-deployment-pipeline.yml`:

1. Verify commit-stage evidence.
2. Verify integration-gate evidence.
3. Build API/Web/Worker/Codex images once.
4. Publish release-candidate digest manifest.
5. Deploy cloud infra/runtime with those digests.
6. Run production smoke checks.
7. Publish release decision.

Key artifacts:

- `.artifacts/release-candidate/<sha>/manifest.json`
- `.artifacts/infra/<sha>/deployment.json`
- `.artifacts/deploy/<sha>/api-smoke.json`
- `.artifacts/release/<sha>/decision.json`
- `.artifacts/pipeline/<sha>/timing.json`

## Replay Path

`cloud-deployment-pipeline-replay.yml`:

1. Resolve source run for the provided SHA.
2. Load prior release-candidate manifest artifact.
3. Redeploy using the same digest refs (no rebuild).
4. Run smoke + release decision evidence again.

## Environment Contract (Cloud)

- One runtime environment: `production`.
- Runtime secrets come from Key Vault only.
- Required production vars:
  - `AZURE_TENANT_ID`
  - `AZURE_SUBSCRIPTION_ID`
  - `AZURE_RESOURCE_GROUP`
  - `AZURE_GITHUB_CLIENT_ID`
  - `ACR_NAME`
  - `KEY_VAULT_NAME`
- Optional identity convergence is disabled by default and only runs when:
  - `IDENTITY_CONVERGE_ENABLED=true`
  - required identity backend vars are present.

## Removed Legacy Flow

The former cloud acceptance topology and acceptance rehearsal workflow are removed from cloud runtime delivery. Release evidence now comes from one push-to-main cloud deploy path plus one manual replay path.

## References

- Policy contract: `.github/policy/pipeline-policy.json`
- Cloud setup runbook: `docs/runbooks/cloud-deployment-pipeline-setup.md`
- Infra contract: `infra/azure/README.md`
