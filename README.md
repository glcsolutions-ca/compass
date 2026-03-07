# Compass

Compass follows a native development pipeline built around one immutable release candidate published during Commit Stage on GitHub merge queue branches and promoted after merge on `main`.

PR-time concerns are split from delivery-time concerns:

- `00-pr-metadata-and-admission.yml` applies informational labels and satisfies GitHub merge queue prerequisites
- `01-cloud-development-pipeline.yml` is the real cloud delivery pipeline

Queue Admission exists only because GitHub merge queue requires a required PR condition before a change can enter the queue. It is a GitHub prerequisite, not part of the deployment pipeline proper. The real development pipeline starts with Commit Stage on integrated code and continues after merge on `main`.

## Delivery model

The pipeline is:

1. `Commit Stage`
2. `Acceptance Stage`
3. `Release Stage`

The key rule is:

- Commit builds the candidate once from integrated code
- Acceptance runs against that exact candidate
- Release promotes that exact candidate
- later stages do not rebuild from source

## GitHub workflow topology

### `00 PR Metadata and Queue Admission`

PR-time only.

It:

- applies informational labels based on changed paths
- runs the minimal Queue Admission sanity checks
- emits `Commit Stage Complete` so the PR can enter merge queue
- still emits legacy `Pipeline Complete` during the cutover window

It does not build candidates, run acceptance, or deploy anything.

### `01 Cloud Development Pipeline`

The real delivery pipeline.

Trigger modes:

- `merge_group` for Commit Stage publication
- `push` to `main` for post-merge Acceptance and Release
- `workflow_dispatch` with `candidate_id` for manual recovery redeploy of a previously released candidate

Normal flow:

1. a PR is reviewed
2. `00-pr-metadata-and-admission.yml` applies labels and runs Queue Admission on the PR
3. the PR is added to GitHub merge queue
4. GitHub creates a merge-group branch
5. `01-cloud-development-pipeline.yml` runs `Commit Stage` on the merge-group branch and publishes the immutable candidate
6. if Commit succeeds, GitHub merges that exact integrated revision to `main`
7. the `push` run on `main` resolves the published candidate, runs `Acceptance Stage`, then runs `Release Stage`
8. if post-merge promotion fails, the response is an explicit revert or fix-forward

## Commit Stage

Commit Stage runs on integrated merge-queue code, not on stale PR heads.

It runs in parallel:

- code gate
- pipeline gate
- image builds

The required merge-queue code gate is intentionally scoped to the deployed surface:

- API
- Web
- DB tooling
- contracts
- SDK

Non-deployed code such as `apps/worker` is kept out of the critical path.

If the commit gates pass, it publishes:

- API image digest
- Web image digest
- Migrations image digest
- release candidate manifest
- release unit OCI index

Successful Commit is the boundary that allows the queued change to merge to `main`.

## Acceptance Stage

Acceptance does not deploy to Azure.

It runs the exact candidate locally in GitHub Actions using:

- local Postgres
- candidate migrations image
- candidate API image with `AUTH_MODE=mock`
- candidate Web image pointing at the candidate API

It writes and attests the acceptance verdict.

Acceptance runs after merge on `push` to `main`, not on the merge-queue branch.

Acceptance stays intentionally lean on the required path:

- one system smoke
- one browser smoke

## Release Stage

Release runs after `main` advances.

It:

1. verifies the acceptance attestation
2. verifies that the previous `main` commit already completed `Mainline Promotion Complete` (or legacy `Pipeline Complete` during cutover)
3. applies production Bicep first when `infra/azure/**` changed in the merged revision
4. deploys the candidate to long-lived stage apps in Azure Container Apps
5. runs read-only stage smoke
6. runs migrations against the production database
7. deploys the same digests to prod apps
8. runs production smoke
9. writes and attests release evidence

If Release fails, `main` is unhealthy and the response is to stop the line, then revert or fix forward.

For new changes, Release only runs after the same candidate has already passed Acceptance.

Stage apps stay scaled to zero between releases for cost control, so the release path keeps the cold-start tradeoff instead of adding extra warm-up logic.

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
- `pnpm check`
- `pnpm check:commit`
- `pnpm check:pipeline`
- `pnpm test:full`

Commit should stay comfortably under the roughly ten-minute guidance Farley/Humble describe for fast integrated feedback. The workflow summaries still show stage elapsed time for operator visibility, but the stage model itself is the primary design concern.

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
6. add the first PR to merge queue so the first candidate is published
7. `pnpm bootstrap:apps -- --candidate-id sha-<merged-main-sha>`
8. rerun `pnpm bootstrap:entra -- --stage-web-fqdn <stage-fqdn>`
9. `pnpm bootstrap:web-domain`

More detail is in [/Users/justinkropp/.codex/worktrees/2bfd/compass/bootstrap/README.md](/Users/justinkropp/.codex/worktrees/2bfd/compass/bootstrap/README.md).

## Recovery redeploy

The preferred response to production issues is to fix forward with a new candidate through the normal pipeline.

Recovery redeploy is a rare fallback, not the normal production path.

Recovery redeploy is only supported for a **previously released** candidate. It:

- verifies prior release attestation
- skips production Bicep apply
- skips migrations
- still redeploys through stage and then prod
- still runs stage smoke and production smoke

If the previous candidate is not compatible with the current schema, recovery redeploy is unsupported and the correct response is a forward fix.

Use the unified pipeline manually:

```sh
gh workflow run 01-cloud-development-pipeline.yml --ref main -f candidate_id=sha-<previous-released-candidate>
```
