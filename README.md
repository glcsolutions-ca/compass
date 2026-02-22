# Compass by GLC

One place to see work, time, and delivery across your company.

## Quick Start

Requirements:

- Node.js `24.x` (from `.nvmrc`; enforced by `engines >=24.8.0 <25`)
- pnpm `10.30.1`

```bash
pnpm install
pnpm dev
```

## Local Postgres (Standard Setup)

Start PostgreSQL with Docker Compose:

```bash
pnpm db:postgres:up
```

`pnpm db:postgres:up` does all local DB bootstrapping:

- starts Docker PostgreSQL
- waits for readiness
- applies migrations from `migrations/`
- seeds demo data from `db/postgres/seed/001_consolidated_employee_views.sql`

The API uses PostgreSQL whenever `DATABASE_URL` is set (see `apps/api/.env.example`):

```bash
DATABASE_URL=postgres://compass:compass@localhost:5432/compass
```

Stop the local database:

```bash
pnpm db:postgres:down
```

Reset local PostgreSQL state (drops volumes, reapplies migrations, reseeds):

```bash
pnpm db:postgres:reset
```

## Migration Workflow

Create a migration:

```bash
pnpm db:migrate:create -- <migration_name>
```

Apply migrations:

```bash
pnpm db:migrate:up
```

Rollback one migration:

```bash
pnpm db:migrate:down -- 1
```

View migration status:

```bash
pnpm db:migrate:status
```

## Doorway

- Contributor workflow: `CONTRIBUTING.md`
- Agent table of contents: `AGENTS.md`
- Merge policy (human): `docs/merge-policy.md`
- Branch protection setup: `docs/branch-protection.md`
- Merge policy (machine): `.github/policy/merge-policy.json`
- CI enforcement workflow: `.github/workflows/merge-contract.yml`
- Deploy workflow: `.github/workflows/deploy.yml`
- Infra apply workflow: `.github/workflows/infra-apply.yml`
- Identity workflows: `.github/workflows/identity-plan.yml`, `.github/workflows/identity-apply.yml`
- Deploy runbook: `docs/runbooks/deploy-aca.md`
- Infra/identity runbook: `docs/runbooks/infra-identity-iac.md`
- Migration safety runbook: `docs/runbooks/migration-safety.md`

## Production Deploy Control Plane

`main` is deployed through a single ACR-first Azure Container Apps pipeline. The deploy workflow:

1. Builds SHA-tagged API and Web images and pushes them to ACR.
2. Runs the DB migration ACA Job first using the same API image.
3. Deploys API and Web with `azure/container-apps-deploy-action`.
4. Runs API smoke and browser-evidence gates before finishing.

Why SHA tags:

- Every image, test artifact, and deploy result points to one exact commit.
- Replays and rollbacks stay deterministic.
- Older commits cannot silently replace newer `main`.

Infrastructure runtime values are environment-driven:

- Store concrete Azure/Entra/resource naming values in GitHub Environment `production` vars/secrets.
- Keep tracked files organization-neutral (no committed tenant IDs, subscription IDs, concrete app names, private DNS zones, or server FQDNs).
- CI leak guard (`scripts/ci/no-org-infra-leak.mjs`) blocks commits with org-specific infra literals.
- Identity workflows use environment-scoped OIDC trust (`repo:<org>/<repo>:environment:production`) with remote tfstate backend.
- Bootstrap trust anchor is manual once (`AZURE_IDENTITY_CLIENT_ID` + tfstate vars), then identity/infra/deploy flows are workflow-driven.

## Source of Truth

CI is authoritative for merge safety.
Local scripts are optional convenience for faster feedback.

Common local checks:

```bash
pnpm check
pnpm build
```
