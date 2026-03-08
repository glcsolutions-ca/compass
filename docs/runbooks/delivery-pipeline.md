# Delivery Pipeline

Compass uses a production-first delivery model with two canonical workflows.

## Workflow topology

- `10-commit-stage.yml`: the required merge-queue check on both `pull_request` and `merge_group`
- `20-mainline-promotion.yml`: post-merge promotion on `push` to `main`, plus rare recovery redeploy by `workflow_dispatch`

## Stage model

The cloud pipeline is:

1. `Commit Stage`
2. `Acceptance Stage`
3. `Release Stage`

The candidate is built once during Commit and then promoted without rebuilds.

## Deployment scope

- one Azure resource group: `rg-compass-prd-cc-001`
- one GitHub deployment environment: `production`
- one stage/prod ACA pair for each deployed app: `api-stage`, `web-stage`, `api-prod`, `web-prod`
- one migrations job
- GHCR as the only image registry

## Validation ownership

- `pnpm check`: product repo health and fast feedback
- `pnpm check:commit`: deployed surfaces plus generated artifacts
- `pnpm check:pipeline`: delivery and infrastructure validation

## Operating guidance

- prefer fix-forward through the normal pipeline
- use manual `workflow_dispatch` only for rare redeploy of a previously released candidate
- keep merge queue as the native entry point for publishing integrated candidates
- keep platform policy and evidence in `platform/pipeline`
- require only `Commit Stage` in the GitHub ruleset

## Related docs

- `docs/architecture/repository-boundaries.md`
- `docs/adr/0001-canonical-product-first-monorepo.md`
- `bootstrap/README.md`
