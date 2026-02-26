# Azure Service Bus One Pager

Use this page for Service Bus operations in Compass. Keep it contract-based and environment-agnostic.

## Scope

- Worker runtime: `apps/worker`
- Service Bus infrastructure: `infra/azure`
- Deployment verification: cloud deployment pipeline cutover checks

## Source of Truth

1. IaC owns namespace, queue, identity wiring, and container app config.
2. Environment values come from GitHub environment vars/secrets.
3. Docs describe contracts and invariants, not concrete resource names.

## Required Runtime Contract

- Worker app env:
  - `SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE`
  - `SERVICE_BUS_QUEUE_NAME`
  - `AZURE_CLIENT_ID`
  - `WORKER_RUN_MODE`
- GitHub environment vars:
  - `WORKER_RUNTIME_IDENTITY_NAME`
  - `SERVICE_BUS_PROD_NAMESPACE_NAME`
  - `SERVICE_BUS_ACCEPTANCE_NAMESPACE_NAME`
  - `SERVICE_BUS_QUEUE_NAME`
  - `WORKER_RUN_MODE`
  - `ACA_WORKER_APP_NAME`

## Security Model

1. Namespace local/SAS auth is disabled (`disableLocalAuth=true`).
2. Worker authenticates with user-assigned managed identity.
3. Worker identity has `Azure Service Bus Data Receiver` at queue scope.

## Deployment Enforcement

`Cloud Deployment Pipeline` verifies after infra apply that:

1. local auth is disabled on both target namespaces
2. worker app is healthy and has required env values
3. worker identity RBAC is present on queue scope

## Operator Checks

```bash
az servicebus namespace show -g "$AZURE_RESOURCE_GROUP" -n "$SERVICE_BUS_PROD_NAMESPACE_NAME" --query disableLocalAuth -o tsv
az servicebus namespace show -g "$AZURE_RESOURCE_GROUP" -n "$SERVICE_BUS_ACCEPTANCE_NAMESPACE_NAME" --query disableLocalAuth -o tsv
az servicebus queue show -g "$AZURE_RESOURCE_GROUP" --namespace-name "$SERVICE_BUS_PROD_NAMESPACE_NAME" -n "$SERVICE_BUS_QUEUE_NAME" --query id -o tsv
az containerapp show -g "$AZURE_RESOURCE_GROUP" -n "$ACA_WORKER_APP_NAME" --query "{state:properties.provisioningState,run:properties.runningStatus,env:properties.template.containers[0].env}" -o json
```

## Change Procedure

1. Change Bicep/runtime/pipeline in one scoped commit.
2. Run `pnpm test:quick`.
3. Push to `main`.
4. Confirm `Cloud Deployment Pipeline` is green.

## Failure Handling

1. Config or RBAC issue: fix env/IaC and rerun pipeline.
2. Code issue: fix forward on `main`.

## References

- `docs/runbooks/cloud-deployment-pipeline-setup.md`
- `infra/azure/main.bicep`
- `infra/azure/modules/servicebus.bicep`
- `infra/azure/modules/containerapp-worker.bicep`
- `scripts/pipeline/cloud/deployment-stage/verify-worker-servicebus-cutover.mjs`
