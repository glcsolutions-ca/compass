# Commit Stage Runbook

## Purpose

Provide fast feedback on integrated code and produce the immutable release candidate.

## Trigger

Commit Stage runs inside `10 Commit Stage` on `merge_group`.

It is the first hard gate on code that GitHub has already integrated for the merge queue check. If Commit passes, the queued change is allowed to merge to `main`.

## Outputs

Commit publishes:

- API image digest
- Web image digest
- Migrations image digest
- release candidate manifest
- release unit OCI index

## Structure

Commit Stage has two modes:

1. `pull_request`: cheap preflight only
2. `merge_group`: the full authoritative stage

The authoritative `merge_group` path runs:

1. mainline guard
2. commit verification (`pnpm check:commit`, `pnpm check:pipeline`, `actionlint`)
3. candidate image builds
4. candidate publication

The candidate is published only after verification and image builds pass.

## Scope

The required merge-queue commit gate covers the deployed surface only:

- `api`
- `web`
- `database`
- `contracts`
- `sdk`

Non-deployed platform tooling is intentionally out of the required path, even though `check:pipeline` still validates the delivery mechanics that protect those deployed surfaces.

## Operational rule

Developers should treat Commit as the first hard gate and wait for it before assuming the change is releasable.

## Runtime target

Commit should stay comfortably under the roughly ten-minute guidance Farley/Humble describe for fast integrated feedback. In this repo we expect materially less, but the important rule is that Commit remains fast enough for engineers to watch it finish before moving on.
