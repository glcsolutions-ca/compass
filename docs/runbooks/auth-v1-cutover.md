# Auth V1 Cutover Runbook

This runbook applies to the Entra-only auth v1 baseline migration rollout.

## When To Use

- first rollout of auth v1 schema in prelaunch environments
- destructive reset of prior prototype auth data

## Preconditions

- No production users or production data migration requirements
- Baseline migration and `db/migrations/checksums.json` are updated and committed
- Entra app registration is configured for multi-tenant organizations flow
- Runtime environment has Entra auth settings configured (`ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_REDIRECT_URI`)
- If tenant restrictions are required, `ENTRA_ALLOWED_TENANT_IDS` is set

## Destructive Reset Sequence

1. Stop runtime services that write auth data.
2. Reset local Postgres (or prelaunch DB) before applying new baseline:

```bash
pnpm db:postgres:down
pnpm db:postgres:reset
```

3. Apply migrations:

```bash
pnpm db:migrate:up
```

4. Verify migration policy and status:

```bash
pnpm db:migrate:check
pnpm db:migrate:status
```

## Verification Checklist

- `/openapi.json` includes auth and tenant endpoints
- `/v1/auth/entra/start` returns redirect to Microsoft
- callback flow creates `users`, `identities`, and `auth_sessions`
- `/v1/auth/me` returns authenticated user context when cookie is present
- tenant create/read/member flows work for authenticated owner
- invite create/accept flow works end to end
- callback consent errors route users to login with admin-consent guidance
- cross-origin POST with session cookie is denied (`CSRF_ORIGIN_DENIED`)
- repeated auth start calls trigger rate limiting (`429 RATE_LIMITED`)

## CI Evidence Requirements

Before promoting to release candidate:

- `pnpm test`
- `pnpm build`
- `pnpm test:integration`
- `pnpm test:e2e` for web route/login entrypoint changes

## Rollback

For prelaunch environments with no production data guarantees:

1. Stop runtime writes.
2. Restore from known good database snapshot, or rerun reset and migrate from the prior release baseline.
3. Re-deploy previously accepted SHA.

For production-like environments after launch, do not use destructive reset; apply forward migrations only.
