# Continuous Delivery Pipeline

Compass uses one production-shaped delivery model:

- local `pnpm verify` mirrors `Commit Stage`
- local `pnpm acceptance` mirrors `Acceptance Stage`
- `20-continuous-delivery-pipeline.yml` is the authoritative cloud pipeline on `push` to `main`

## Workflow topology

- `05-pr-labels.yml`: metadata only on `pull_request`
- `10-pr-verify.yml`: runs `pnpm verify` on the PR head and fails stale branches
- `20-continuous-delivery-pipeline.yml`: authoritative candidate build, acceptance, and release on `push` to `main`
- `40-infra.yml`: validates and applies infrastructure only for infra-owned files and direct infra-workflow support files

## Stage model

The CDP is:

1. `Commit Stage`
2. `Acceptance Stage`
3. `Release Stage`

The candidate is built once during Commit and then promoted without rebuilds.

## Validation ownership

- `pnpm verify`: local Commit Stage
- `pnpm acceptance`: local Acceptance Stage
- `10-pr-verify.yml`: preventive PR verification and stale-branch detection
- `20-continuous-delivery-pipeline.yml`: builds, validates, and deploys the exact promoted candidate
- `40-infra.yml`: Bicep validation and infra apply for Azure infra files and direct support files

## Operating model

- `main` is the authoritative integration line
- direct pushes to `main` are allowed by judgment
- PRs are optional collaboration, not the source of truth
- PRs must be rebased onto `main` before merge
- the required PR status check is `Verify`
- `main` stays linear and PRs merge by squash only
- if Commit, Acceptance, or Release goes red on `main`, the line stops until fixed forward

## Deployment scope

- one Azure resource group: `rg-compass-prd-cc-001`
- one GitHub deployment environment: `production`
- one stage/prod ACA pair for each deployed app: `api-stage`, `web-stage`, `api-prod`, `web-prod`
- one migrations job
- GHCR as the only image registry

Bootstrap is separate from the CDP. The one-time production staging flow lives in [bootstrap/README.md](/Users/justinkropp/.codex/worktrees/68b7/compass/bootstrap/README.md).
