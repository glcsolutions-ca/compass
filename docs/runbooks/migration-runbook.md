# Migration Runbook

Purpose: create, validate, and apply database migrations safely.

## When To Use

- schema changes
- migration policy or checksum updates

## Inputs

- migration intent and rollback strategy

## Steps

1. Create migration:

```bash
pnpm db:migrate:create -- <migration_name>
```

2. Validate migration policy/checksums:

```bash
pnpm db:migrate:check
```

3. Apply migration and inspect status:

```bash
pnpm db:migrate:up
pnpm db:migrate:status
```

## Verify

- policy check passes
- migration applies cleanly
- status reflects expected schema state

## Failure Handling

- fix migration and re-run checks
- rollback/restore using approved recovery process
