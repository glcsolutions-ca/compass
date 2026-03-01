# Auth V1 Cutover Runbook

Purpose: execute Entra-only auth cutover with controlled rollback.

## When To Use

- resetting auth baseline
- rotating auth secrets/config in a controlled deployment window

## Inputs

- Azure access
- GitHub environment variable access
- Key Vault access

## Steps

1. Reset local DB if required:

```bash
pnpm db:postgres:down
pnpm db:postgres:reset
```

2. Validate migration policy and state:

```bash
pnpm db:migrate:check
pnpm db:migrate:status
```

3. Apply required auth config and secrets in Key Vault.
4. Push change to `main` and allow standard cloud pipeline promotion.

## Verify

- `commit-stage` and `integration-gate` pass
- cloud deployment writes release decision artifact
- auth callback flow succeeds

## Failure Handling

- fix forward immediately when safe
- otherwise revert the cutover change and redeploy
