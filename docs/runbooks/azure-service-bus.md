# Azure Service Bus Runbook

Purpose: operate and verify Service Bus topology and worker integration.

## When To Use

- onboarding new environment values
- diagnosing worker queue delivery issues

## Inputs

- `AZURE_RESOURCE_GROUP`
- Service Bus namespace names
- queue name
- worker app name

## Steps

1. Verify namespace local auth policy:

```bash
az servicebus namespace show -g "$AZURE_RESOURCE_GROUP" -n "$SERVICE_BUS_PROD_NAMESPACE_NAME" --query disableLocalAuth -o tsv
```

2. Verify queue exists and identity wiring is valid.
3. Verify worker app references expected Service Bus settings.

## Verify

- namespace policy and queue resources are present
- worker connects and consumes expected messages

## Failure Handling

- correct namespace/queue config
- correct worker identity/env wiring
- redeploy through standard cloud pipeline
