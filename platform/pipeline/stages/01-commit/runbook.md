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

Commit Stage runs on `merge_group`. Pull request labeling lives in `05 PR Labels` and is not part of the delivery stage model.

The `merge_group` path runs:

1. candidate image builds
2. fast candidate smoke against the published digests
3. candidate publication

The candidate is published only after the image builds and candidate smoke pass.

## Scope

The required merge-queue commit gate covers the deployed surface only:

- `api`
- `web`
- `database`
- `contracts`
- `sdk`

Non-deployed platform tooling is intentionally out of the required path. Infra validation and apply live in the separate infra workflow.

## Operational rule

Developers should treat Commit as the first hard gate and wait for it before assuming the change is releasable.

## Runtime target

Commit should stay comfortably under the roughly ten-minute guidance Farley/Humble describe for fast integrated feedback. In this repo we expect materially less, but the important rule is that Commit remains fast enough for engineers to watch it finish before moving on.
