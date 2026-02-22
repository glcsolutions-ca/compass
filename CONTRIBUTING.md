# Contributing

This repo treats CI as the source of truth for merge safety.

## Start Here

- Human policy: `docs/merge-policy.md`
- Machine policy: `.github/policy/merge-policy.json`
- CI workflow: `.github/workflows/merge-contract.yml`
- Deploy workflow: `.github/workflows/deploy.yml`
- Infra/Identity workflows: `.github/workflows/infra-apply.yml`, `.github/workflows/identity-plan.yml`, `.github/workflows/identity-apply.yml`

## Prerequisites

- Node.js `24.x` (`.nvmrc`; enforced range `>=24.8.0 <25`)
- `pnpm` (`packageManager` pinned in `package.json`)

## Local Workflow (Convenience)

```bash
pnpm install
pnpm db:postgres:up
pnpm dev
pnpm check
pnpm build
```

Use `pnpm clean` when needed.

`pnpm db:postgres:up` runs the standard local DB flow:

- starts Docker PostgreSQL
- waits until the DB is ready
- applies migrations from `migrations/`
- seeds local demo data

The API uses PostgreSQL when `DATABASE_URL` is set in `apps/api/.env` (see `apps/api/.env.example`).
Use `pnpm db:postgres:down` to stop PostgreSQL.
Use `pnpm db:postgres:reset` to drop local volumes and rebuild the DB from migrations + seed data.

## Migration Workflow

```bash
pnpm db:migrate:create -- <migration_name>
pnpm db:migrate:up
pnpm db:migrate:status
pnpm db:migrate:down -- 1
```

## CI Merge Contract

CI runs deterministic ordered checks and fails closed at `risk-policy-gate`.
Branch protection should require only `risk-policy-gate`.

`codex-review` enforcement is controlled by `reviewPolicy.codexReviewEnabled` in `.github/policy/merge-policy.json`.

## PR Checklist

- [ ] Local convenience checks pass (`pnpm check`, `pnpm build`).
- [ ] Control-plane edits also update policy/docs where required.
- [ ] No unrelated files or generated noise are included.
- [ ] `pnpm check:no-org-infra` passes.

## Deploy + IaC Checklist

- [ ] `infra/identity/**` changes include updated `identity-plan` evidence and docs when behavior changes.
- [ ] `infra/azure/**` changes include `infra-apply` validation and docs updates.
- [ ] CAF naming (`type-workload-env-region-instance`) is preserved for Azure resource names.
- [ ] Concrete production values are sourced from GitHub Environment `production` vars/secrets, not tracked files.
- [ ] `scripts/deploy/**` or workflow changes preserve machine-verifiable artifacts under `.artifacts/deploy/<sha>/`.
- [ ] Deploy gates remain SHA-bound and rollback-capable.
