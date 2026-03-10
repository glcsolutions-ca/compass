# Continuous Delivery Pipeline

Compass uses one production-shaped delivery model:

- local `pnpm verify` mirrors `Commit Stage`
- local `pnpm acceptance` mirrors `Acceptance Stage`
- `20-continuous-delivery-pipeline.yml` is the authoritative cloud pipeline on `push` to `main`

## Workflow topology

- `10-pr-sync.yml`: fails stale branches only
- `20-continuous-delivery-pipeline.yml`: authoritative candidate build, acceptance, and release on `push` to `main`
- `40-infra.yml`: validates and applies infrastructure only for infra-owned files and direct infra-workflow support files

## Stage model

The CDP is:

1. `Commit Stage`
2. `Acceptance Stage`
3. `Release Stage`

The candidate is built once during Commit and then promoted without rebuilds.

Required stage suites are strict by default:

- Commit Stage integration tests provision their own Postgres dependency and fail if setup, migration, seeding, or test execution fails.
- Acceptance Stage contains only required black-box API and Web suites.

## Validation ownership

- `pnpm verify`: local Commit Stage
- `pnpm acceptance`: local Acceptance Stage
- `10-pr-sync.yml`: preventive stale-branch detection only
- `20-continuous-delivery-pipeline.yml`: builds, validates, and deploys the exact promoted candidate
- `40-infra.yml`: Bicep validation and infra apply for Azure infra files and direct support files

## Operating model

- `main` is the authoritative integration line
- direct pushes to `main` are allowed by judgment
- PRs are optional collaboration, not the source of truth
- PRs must be rebased onto `main` before merge
- the required PR status check is `In Sync`
- `main` stays linear and PRs merge by squash only
- if Commit, Acceptance, or Release goes red on `main`, the line stops until fixed forward

## Live config and secret model

- GitHub repository variables: live non-secret but sensitive deployment values
- Azure Key Vault: runtime secrets only
- GitHub environments: deployment protection, history, and URL only
- repo: code, pipeline logic, contracts, and public metadata only
