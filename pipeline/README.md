# Pipeline

Compass uses one native GitHub development pipeline built around merge queue and one immutable release candidate.

## Stages

### `Commit Stage`

Runs first, on integrated merge-queue code.

### `Acceptance Stage`

Runs second, against the exact candidate produced by Commit.

### `Release Stage`

Runs third, deploying the exact accepted candidate to Azure before `main` advances.

## Workflow topology

### `00 PR Metadata`

Optional, non-blocking PR labeling only.

### `01 Development Pipeline`

The real pipeline and the only required status check path.

Triggers:

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
