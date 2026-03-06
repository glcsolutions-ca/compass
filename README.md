# Compass

Compass uses a simple development pipeline built around one immutable release candidate:

1. `01 Commit` builds the candidate once and publishes digest-pinned images to `GHCR`.
2. `02 Acceptance` runs the exact candidate locally in GitHub Actions against ephemeral infrastructure.
3. `03 Release` deploys the exact candidate to long-lived stage apps in Azure Container Apps, smoke-tests them, runs migrations, and then deploys the same digests to production apps.

## Architecture

### Azure

There is one production Azure resource group:

- `rg-compass-prd-cc-001`

It contains:

- ACA environment
- `api-prod`
- `web-prod`
- `api-stage`
- `web-stage`
- migrate job
- Key Vault
- PostgreSQL
- VNet/subnets
- Log Analytics
- Azure DNS zone for `compass.glcsolutions.ca`

There is no permanent acceptance Azure environment.

### Registry

Deployable images are published to `GHCR`:

- `ghcr.io/glcsolutions-ca/compass-api`
- `ghcr.io/glcsolutions-ca/compass-web`
- `ghcr.io/glcsolutions-ca/compass-migrations`

### Domains

Only the production web app has a public custom domain:

- `https://compass.glcsolutions.ca`

The stage apps use their ACA default hostnames.

## Local development

- `pnpm install`
- `pnpm dev`
- `pnpm test:quick`
- `pnpm test:full`

Local Postgres helpers:

- `pnpm db:postgres:up`
- `pnpm db:postgres:down`

## Admin bootstrap

Bootstrap is a manual admin concern. It is not part of the normal delivery pipeline.

Typical sequence:

1. `pnpm bootstrap:entra -- --reset-web-client-secret`
2. `pnpm bootstrap:github:apply`
3. `pnpm bootstrap:ghcr`
4. `pnpm infra:apply`
5. `pnpm bootstrap:keyvault:seed`
6. merge the first candidate to `main`
7. `pnpm bootstrap:apps -- --candidate-id sha-<commit>`
8. rerun `pnpm bootstrap:entra -- --stage-web-fqdn <stage-fqdn>`
9. `pnpm bootstrap:web-domain`

More detail is in [/Users/justinkropp/.codex/worktrees/2bfd/compass/bootstrap/README.md](bootstrap/README.md).

## Delivery model

### `00 PR Validation`

Fast validation on pull requests. No Azure mutation.

### `01 Commit`

Runs on `push` to `main`.

- quick checks
- build API/Web/Migrations once
- publish the release candidate manifest and release unit

### `02 Acceptance`

Runs on the exact candidate produced by Commit.

- local Postgres in GitHub Actions
- candidate migrations image
- candidate API image with `AUTH_MODE=mock`
- candidate Web image pointing at the candidate API
- system/browser acceptance tests

### `03 Release`

Runs on the accepted candidate.

- applies production support Bicep if `infra/azure/**` changed
- deploys to `api-stage` and `web-stage`
- runs read-only stage smoke
- runs migrations against production DB
- deploys the same digests to `api-prod` and `web-prod`
- runs production smoke
- records release evidence and attestation

## Rollback

Rollback is a prior-candidate redeploy:

- rerun `03 Release` with a previous accepted `candidate_id`

There is no revision-traffic rollback in this model.
