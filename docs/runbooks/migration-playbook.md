# Migration Playbook

## Purpose

Migrations are the **source of truth** for schema changes. This is the minimum contract to keep changes **safe, deterministic, and deployable**.

## Hard rules (non‑negotiable)

- **One production path:** migrations run **only** in the pipeline migration job — **never** at API startup.
- **Immutable after merge:** never edit an existing migration; add a new one.
- **Fail closed:** if a migration fails, the release stops.
- **Forward‑first:** production rollback is **restore + redeploy**, not routine `down` migrations.
- **Current policy:** no backward-compat requirement right now; destructive resets are allowed during this early stage.

## File contract

- Directory: `db/migrations/`
- Filename: `^\d{13}_[a-z0-9_]+\.mjs$`
- Format: **`.mjs` only**
- Integrity ledger: `db/migrations/checksums.json`
- Validate (required): `pnpm db:migrate:check`

## Author workflow (default)

1. Create: `pnpm db:migrate:create -- <name>`
2. Implement `up` (only add `down` for local dev if truly needed).
3. Validate: `pnpm db:migrate:check`
4. Apply locally: `pnpm db:migrate:up`
5. Verify: `pnpm db:migrate:status`

## Writing rules (keep it safe)

- Keep migrations **small** and **single-purpose**.
- Prefer **additive-first** changes; do destructive changes only when explicitly intended.
- Avoid mixing heavy/locking operations with other changes — split migrations.
- Index ops: isolate; use non-transaction mode when Postgres requires it.
- **Never edit history.** Fix with a new migration.

## What the pipeline does (automatic)

- Builds a release-candidate image and pins it by digest.
- Updates the migration job to that **exact digest**.
- If `requires_migrations=true`: starts migration job and waits.
- Migration must pass before API/Web/Codex rollout.
- Writes diagnostics to: `.artifacts/deploy/<sha>/migration.json`

## Runtime guardrails

- Ordered execution + lock controls.
- Enforced timeouts via job env (`lock_timeout`, `statement_timeout`).
- Bounded wait: `MIGRATION_TIMEOUT_SECONDS`.

## CI expectations

`migration-safety` must prove:

- policy check passes,
- migrations apply,
- second apply is a no-op,
- status is clean.

## If a migration fails

1. Rollout stops automatically.
2. Read artifacts + job logs.
3. Fix forward with a **new** migration, or restore DB + redeploy if required.
4. Replay a known-good release-candidate SHA if needed.
