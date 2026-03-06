# Commit Stage Runbook

## Purpose

Provide a fast signal and produce the immutable release candidate.

## Outputs

Commit publishes:

- API image digest
- Web image digest
- Migrations image digest
- release candidate manifest
- release unit OCI index

## Operational rule

Developers should treat Commit as the first hard gate and wait for it before moving on.
