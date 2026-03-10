# Delivery Pipeline

Compass uses a production-first delivery model with six focused workflows.

## Workflow topology

- `05-pr-labels.yml`: metadata only on `pull_request`
- `09-queue-admission.yml`: no-op `Commit Stage` status on `pull_request`
- `10-commit-stage.yml`: authoritative candidate build on `merge_group`
- `20-acceptance.yml`: triggered by successful `Commit Stage` completion for the merge-queue SHA
- `30-release.yml`: triggered by successful `Acceptance` completion for the same candidate
- `40-infra.yml`: validates/applies infrastructure only for infra-owned files and direct infra-workflow support files

## Stage model

The cloud pipeline is:

1. `Commit Stage`
2. `Acceptance Stage`
3. `Release Stage`

The candidate is built once during Commit and then promoted without rebuilds.

Bootstrap is separate from this pipeline. The one-time production staging flow lives in [bootstrap/README.md](/Users/justinkropp/.codex/worktrees/0370/compass/bootstrap/README.md), and steady-state Release should not absorb first-time environment creation concerns.

## Deployment scope

- one Azure resource group: `rg-compass-prd-cc-001`
- one GitHub deployment environment: `production`
- one stage/prod ACA pair for each deployed app: `api-stage`, `web-stage`, `api-prod`, `web-prod`
- one migrations job
- GHCR as the only image registry

## Validation ownership

- `pnpm test`: fast local lint, typecheck, and unit-test suite
- `20-acceptance.yml`: behavioral validation of the published candidate
- `30-release.yml`: deployment of the exact accepted candidate
- `40-infra.yml`: Bicep validation and infra apply for Azure infra files, infra scripts, and the direct files the workflow executes

## Operating guidance

- prefer fix-forward through the normal pipeline
- keep merge queue as the native entry point for publishing integrated candidates
- keep platform policy and evidence in `platform/pipeline`
- require only `Commit Stage` in the GitHub ruleset
- validate `workflow_run` stage changes with one additional promoted candidate after merge, because downstream stages load from `main` when they start

## Related docs

- `docs/architecture/repository-boundaries.md`
- `docs/adr/0001-canonical-product-first-monorepo.md`
- `bootstrap/README.md`
