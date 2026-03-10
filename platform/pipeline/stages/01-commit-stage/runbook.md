# Commit Stage Runbook

## Purpose

Provide fast feedback on integrated code, catch the majority of failures early, and produce the immutable release candidate.

## Trigger

Commit Stage runs inside `20 Continuous Delivery Pipeline` on `push` to `main`.

It is the first hard gate on code that has already landed on `main`. If Commit passes, the change remains eligible for promotion through Acceptance Stage and Release Stage.

## Structure

Commit Stage owns:

1. unit tests
2. integration tests
3. candidate image build
4. candidate smoke
5. candidate publication

`pnpm verify` mirrors this stage locally. The local path runs the same stage-owned scripts, builds the same candidate contract, and smokes that candidate without publishing to shared registries.

## Outputs

Commit publishes:

- API image digest
- Web image digest
- release candidate manifest
- release unit OCI index

## Scope

Commit Stage covers the deployed product surface:

- `api`
- `web`
- `database`
- `contracts`
- `sdk`

Infra validation and apply live in the separate infra workflow.

## Runtime target

Commit should stay comfortably under the roughly ten-minute guidance Farley and Humble describe for fast integrated feedback. The important rule is that engineers can watch it finish and act on it immediately.
