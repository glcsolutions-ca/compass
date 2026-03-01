# Worker App

Purpose: background processing for queue-driven runtime work.

## Start Here

- source: `apps/worker/src`
- queue config: env + Service Bus runbook

## Run And Test

```bash
pnpm dev:worker
pnpm --filter @compass/worker dev
pnpm --filter @compass/worker test
```

## Source Of Truth

- `docs/runbooks/azure-service-bus.md`
- `docs/development-pipeline.md`
