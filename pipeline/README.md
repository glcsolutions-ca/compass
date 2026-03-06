# Pipeline

Compass uses one native GitHub development pipeline built around merge queue and one immutable release candidate.

A lightweight `Queue Admission` job runs on `pull_request` only to satisfy GitHub merge queue entry requirements. The real staged pipeline still starts at Commit Stage on `merge_group`.

## Stages

### `Commit Stage`

Runs first, on integrated merge-queue code.

### `Acceptance Stage`

Runs second, against the exact candidate produced by Commit.

### `Release Stage`

Runs third, deploying the exact accepted candidate to Azure before `main` advances.

## Workflow topology

### `01 Development Pipeline`

The real pipeline and the only required status check path.

Triggers:

- `pull_request` for the lightweight queue-admission check
- `merge_group` for normal delivery
- `workflow_dispatch` with `candidate_id` for manual redeploy

## Candidate flow

The key rule is:

- Commit builds and publishes the candidate once
- Acceptance and Release consume that exact candidate
- later stages do not rebuild images

## Current production architecture

- one Azure production resource group
- one GitHub deployment environment: `production`
- long-lived ACA app pairs for stage/prod
- automatic release after Acceptance success on merge queue
- rollback by prior-candidate redeploy
