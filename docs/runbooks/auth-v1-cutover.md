# Auth V1 Cutover Runbook

This runbook applies to the Entra-only auth v1 clean-slate rollout.

## When To Use

- first rollout of the single v1 baseline schema migration
- destructive reset of prior prototype auth data in prelaunch/production-like environments

## Preconditions

- No production users or production data migration requirements
- Auth migrations and `db/migrations/checksums.json` are updated and committed
- Entra app registration is configured for multi-tenant organizations flow
- Runtime environment has Entra auth settings configured (`ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `AUTH_OIDC_STATE_ENCRYPTION_KEY`, `ENTRA_REDIRECT_URI`)
- If tenant restrictions are required, `ENTRA_ALLOWED_TENANT_IDS` is set

## Destructive Reset Sequence

1. Stop runtime services that write auth data.
2. Reset local Postgres (or prelaunch DB) before applying the new baseline:

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

For production clean-slate reset on Azure Postgres flexible server:

```bash
az postgres flexible-server db delete \
  --resource-group <azure-resource-group> \
  --server-name <postgres-server-name> \
  --database-name compass \
  --yes

az postgres flexible-server db create \
  --resource-group <azure-resource-group> \
  --server-name <postgres-server-name> \
  --database-name compass \
  --charset UTF8 \
  --collation en_US.utf8
```

## Verification Checklist

- `/openapi.json` includes auth and tenant endpoints
- `/v1/auth/entra/start` returns redirect to Microsoft
- `/v1/auth/entra/start` redirect URL includes:
  - host `login.microsoftonline.com`
  - path `/organizations/oauth2/v2.0/authorize`
  - expected `redirect_uri` callback
  - expected `client_id`
- callback flow creates `users`, `identities`, and `auth_sessions`
- `/v1/auth/me` returns authenticated user context when cookie is present
- tenant create/read/member flows work for authenticated owner
- invite create/accept flow works end to end
- invite replay from a different user returns `409 INVITE_ALREADY_ACCEPTED`
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
