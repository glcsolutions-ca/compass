# Commit Stage Runbook

## Purpose

Provide a fast signal on integrated code and produce the immutable release candidate.

## Trigger

Commit Stage runs inside `01 Development Pipeline` on `merge_group`.

It is the first hard gate on code that GitHub has already integrated for the merge queue check.

## Outputs

Commit publishes:

- API image digest
- Web image digest
- Migrations image digest
- release candidate manifest
- release unit OCI index

## Structure

Commit is split into parallel jobs:

1. code gate
2. pipeline gate
3. image builds
4. candidate publication

The candidate is published only after both gates pass.

## Operational rule

Developers should treat Commit as the first hard gate and wait for it before assuming the change is releasable.
