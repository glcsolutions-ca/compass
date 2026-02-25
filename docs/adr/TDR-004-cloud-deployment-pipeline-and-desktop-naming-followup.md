# TDR-004: Cloud Deployment Pipeline Simplification And Naming Follow-Up

## Status

Accepted

## Date

2026-02-24

## Summary

Refactor cloud deployment pipeline to plain language and Farley-aligned terms:

- use `cloud-deployment-pipeline.yml` for push-to-main delivery
- split replay into dedicated `cloud-deployment-pipeline-replay.yml`
- add dedicated integration workflow `integration-gate.yml`
- rename cloud artifact contract to `release candidate` terminology
- rename cloud wording from `control-plane` to `deployment pipeline config`

Desktop naming follows the same release-candidate terminology (`release_candidate_*` / `RELEASE_CANDIDATE_*`).

## Context

The previous cloud workflow mixed push delivery and replay paths, and used abstract naming (legacy artifact labels and legacy control-plane wording) that made stage intent harder to follow.

The desired operating model is:

- small batch commit gate
- build once
- promote the same release candidate without rebuild
- verify real behavior before and after production deploy

## Decision

1. Rename cloud workflow file:

- from the previous cloud push workflow filename
- to `.github/workflows/cloud-deployment-pipeline.yml`

2. Create dedicated replay workflow:

- `.github/workflows/cloud-deployment-pipeline-replay.yml`
- manual input: `release_candidate_sha`

3. Rename cloud package contract:

- cloud manifest path -> `.artifacts/release-candidate/<sha>/manifest.json`
- cloud artifact name -> `release-candidate-<sha>`
- cloud replay input -> `release_candidate_sha`

4. Rename cloud config language:

- `control-plane` -> `deployment pipeline config` in cloud/commit docs and cloud outputs

5. Keep branch protection explicit for both mainline gates:

- required contexts are `commit-stage` and `integration-gate`

## Consequences

- Cloud flow is easier to read and troubleshoot.
- Replay behavior is explicit and isolated from the push path.
- Cloud contracts are clearer and align with build-once/promotion language.
- Desktop pipeline still has legacy `candidate_*` naming and will be migrated in a separate change.

## Follow-Up

Track desktop naming migration as a separate ADR/change sequence:

- `desktop-deployment-pipeline.yml` and `desktop-deployment-pipeline.yml` input/output naming
- desktop artifact naming (`desktop-release-candidate-*`)
- desktop runbook/docs wording

## References

- `.github/workflows/cloud-deployment-pipeline.yml`
- `.github/workflows/cloud-deployment-pipeline-replay.yml`
- `.github/workflows/commit-stage.yml`
- `.github/workflows/integration-gate.yml`
- `docs/runbooks/cloud-deployment-pipeline-setup.md`
