# Migration Playbook (One Page)

## Why this exists

Migrations are the source of truth for database schema. This playbook defines the minimum rules to keep schema changes safe, deterministic, and deployable.

## Non-negotiables

- One production path only: migration runs in the pipeline migration job, never at API startup.
- Migrations are immutable after merge.
- Fail closed: if migration fails, deployment stops.
- Forward-first operations: production rollback is restore/redeploy, not routine `down` migrations.
- Current program policy: no backward-compat requirement; destructive resets are allowed during this early stage.

## File contract

- Location: `db/migrations/`
- Filename: `^\d{17}_[a-z0-9_]+\.mjs$`
- Extension: `.mjs` only
- Integrity ledger: `db/migrations/checksums.json`
- Validate before running: `pnpm db:migrate:check`

## Author workflow (default)

1. Create migration: `pnpm db:migrate:create -- <name>`
2. Implement `up` steps (and local-only `down` if truly needed).
3. Validate policy: `pnpm db:migrate:check`
4. Apply locally: `pnpm db:migrate:up`
5. Confirm state: `pnpm db:migrate:status`

## Safety rules for writing migrations

- Keep each migration small and single-purpose.
- Prefer additive changes first; destructive changes only when explicitly intended.
- For heavy/locking operations, split into separate migrations and avoid mixing concerns.
- For concurrent index operations, isolate in dedicated migrations and use non-transaction mode where required by Postgres.
- Never edit a historical migration file; add a new migration instead.

## Deployment behavior (what happens automatically)

- Release candidate image is built and pinned by digest.
- Migration job image is updated to that exact digest.
- If `requires_migrations=true`, pipeline starts migration job and waits for completion.
- Migration must pass before API/Web/Codex rollout.
- Diagnostics are written to `.artifacts/deploy/<sha>/migration.json`.

## Runtime guardrails

- Migration runtime uses explicit ordering and lock controls.
- Session timeouts are enforced (`lock_timeout`, `statement_timeout`) via migration job env.
- Deployment wait timeout is bounded (`MIGRATION_TIMEOUT_SECONDS`).

## CI expectations

`migration-safety` must prove:

- migration policy passes,
- migrations apply,
- second apply is a no-op,
- migration status is clean.

## If migration fails

1. Stop rollout (pipeline already does this).
2. Read migration artifact + job logs.
3. Fix forward with a new migration, or restore DB and redeploy if required.
4. Replay a known-good release candidate SHA if needed.
