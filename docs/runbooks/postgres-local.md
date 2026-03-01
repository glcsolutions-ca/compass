# Postgres Local Runbook

Purpose: operate local Postgres for integration and migration testing.

## When To Use

- local API integration tests
- migration development and validation

## Steps

Start and seed local Postgres:

```bash
pnpm db:postgres:up
```

Run local services/tests:

```bash
pnpm dev
pnpm test:integration
```

Stop Postgres:

```bash
pnpm db:postgres:down
```

Reset local state:

```bash
pnpm db:postgres:reset
```

## Verify

- database starts and health checks pass
- migrations and seed complete
- integration tests can connect

## Failure Handling

- check container logs
- re-run reset and migrations
- inspect env/bootstrap values for current worktree
