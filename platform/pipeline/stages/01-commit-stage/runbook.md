# Commit Stage Runbook

## Purpose

Provide fast feedback on integrated code, catch the majority of failures early, and produce the immutable release candidate.

## Trigger

Commit Stage runs inside `20 Continuous Delivery Pipeline` on `push` to `main`.

It is the first hard gate on code that has already landed on `main`. If Commit passes, the change remains eligible for promotion through Acceptance Stage and Release Stage.

## Structure

Commit Stage owns:

1. static analysis
2. unit tests
3. integration tests
4. candidate image build
5. canonical manifest generation
6. API runtime smoke against that manifest
7. candidate publication

`pnpm verify` mirrors this stage locally. The local path runs the same stage-owned scripts, builds the same candidate contract, and smokes that candidate without publishing to shared registries.

## Outputs

Commit publishes:

- API image digest
- Web image digest
- release candidate manifest
- release unit OCI index

The manifest is generated once from the built digests before smoke and then reused unchanged for publication and all later stages.

## Commit proof

Commit Stage answers one question:

Can this integrated change produce a trustworthy release candidate quickly enough to promote?

The proof boundary is intentionally narrow:

- static analysis, unit tests, and integration tests catch fast code-level and adapter failures
- image build proves the exact deployable candidate can be packaged
- API runtime smoke proves the migrated API candidate boots from the built image and serves the minimum public contract
- publication makes the already-proven candidate available to downstream stages

Commit does not prove user journeys. Browser behavior and end-to-end product flows belong to Acceptance Stage.

## Scope

Commit Stage covers the deployed product surface:

- `api`
- `web`
- `database`
- `contracts`
- `sdk`

Infra validation and apply live in the separate infra workflow.

## Smoke scope

Commit smoke is deliberately smaller than Acceptance:

- starts the candidate API image against a real ephemeral Postgres
- runs the same migrations path the candidate will use later
- verifies the public API comes up and exposes the minimum health and contract endpoints

It does not start the Web image and it does not assert user-facing flows. Those belong to Acceptance Stage, which boots the full candidate and exercises public browser behavior.

## Runtime target

Commit should stay comfortably under the roughly ten-minute guidance Farley and Humble describe for fast integrated feedback. The important rule is that engineers can watch it finish and act on it immediately.
