# Azure Service Bus One Pager

Use this page for day-to-day Service Bus operations in Compass.

## Canonical Topology

- Production namespace: `sb-compass-prod-cc-4514-01`
- Acceptance namespace: `sb-compass-acc-cc-4514-01`
- Queue: `compass-events`
- Worker runtime: `apps/worker` (Container App)

## Source of Truth

- IaC owns namespace, queue, and runtime wiring.
- Primary definitions:
  - `infra/azure/main.bicep`
  - `infra/azure/modules/servicebus.bicep`
  - `infra/azure/modules/containerapp-worker.bicep`

## Runtime Contract (Required)

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

- Namespace local/SAS auth disabled (`disableLocalAuth=true`).
- Worker authenticates with user-assigned managed identity.
- Worker identity must have `Azure Service Bus Data Receiver` at queue scope.

## Deployment Gates

- `Cloud Deployment Pipeline` performs cutover verification after infra apply.
- Verification checks:
  - both namespaces have local auth disabled
  - worker app is healthy and has required env
  - worker identity + queue RBAC is present

## Fast Operator Checks

```bash
az servicebus namespace show -g "$AZURE_RESOURCE_GROUP" -n "$SERVICE_BUS_PROD_NAMESPACE_NAME" --query disableLocalAuth -o tsv
az servicebus namespace show -g "$AZURE_RESOURCE_GROUP" -n "$SERVICE_BUS_ACCEPTANCE_NAMESPACE_NAME" --query disableLocalAuth -o tsv
az servicebus queue show -g "$AZURE_RESOURCE_GROUP" --namespace-name "$SERVICE_BUS_PROD_NAMESPACE_NAME" -n "$SERVICE_BUS_QUEUE_NAME" --query id -o tsv
az containerapp show -g "$AZURE_RESOURCE_GROUP" -n "$ACA_WORKER_APP_NAME" --query "{state:properties.provisioningState,run:properties.runningStatus,env:properties.template.containers[0].env}" -o json
```

## Change Procedure

1. Change Bicep/runtime/pipeline in one scoped commit.
2. Run `pnpm test:static`.
3. Push to `main`.
4. Confirm `Cloud Deployment Pipeline` is green.

## Failure Handling

- Config or RBAC issue: correct env/IaC and rerun pipeline.
- Code issue: fix forward on `main`.

## References

- `docs/runbooks/cloud-deployment-pipeline-setup.md`
- `scripts/pipeline/cloud/deployment-stage/verify-worker-servicebus-cutover.mjs`
