# TDR-004: Cloud Delivery Pipeline Simplification And Naming Follow-Up

## Status

Accepted

## Date

2026-02-24

## Summary

Refactor cloud delivery to plain language and Farley-aligned terms:

- use `cloud-delivery-pipeline.yml` for push-to-main delivery
- split replay into dedicated `cloud-delivery-replay.yml`
- rename cloud artifact contract from `candidate` to `release package`
- rename cloud wording from `control-plane` to `delivery config`

Desktop naming (`candidate_*`) remains unchanged for now and is tracked as follow-up work.

## Context

The previous cloud workflow mixed push delivery and replay paths, and used abstract naming (`candidate`, `control-plane`) that made stage intent harder to follow.

The desired operating model is:

- small batch commit gate
- build once
- promote the same package without rebuild
- verify real behavior before and after production deploy

## Decision

1. Rename cloud workflow file:

- from the previous cloud push workflow filename
- to `.github/workflows/cloud-delivery-pipeline.yml`

2. Create dedicated replay workflow:

- `.github/workflows/cloud-delivery-replay.yml`
- manual input: `release_package_sha`

3. Rename cloud package contract:

- cloud manifest path -> `.artifacts/release-package/<sha>/manifest.json`
- cloud artifact name -> `release-package-<sha>`
- cloud replay input -> `release_package_sha`

4. Rename cloud config language:

- `control-plane` -> `delivery config` in cloud/commit docs and cloud outputs

5. Keep branch protection unchanged:

- required context remains only `commit-stage`

## Consequences

- Cloud flow is easier to read and troubleshoot.
- Replay behavior is explicit and isolated from the push path.
- Cloud contracts are clearer and align with build-once/promotion language.
- Desktop pipeline still has legacy `candidate_*` naming and will be migrated in a separate change.

## Follow-Up

Track desktop naming migration as a separate ADR/PR sequence:

- `desktop-deployment-pipeline.yml` and `desktop-release.yml` input/output naming
- desktop artifact naming (`desktop-candidate-*`)
- desktop runbook/docs wording

## References

- `.github/workflows/cloud-delivery-pipeline.yml`
- `.github/workflows/cloud-delivery-replay.yml`
- `.github/workflows/commit-stage.yml`
- `docs/runbooks/cloud-delivery-pipeline.md`
