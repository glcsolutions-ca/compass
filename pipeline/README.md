# Pipeline

Compass uses one native GitHub development pipeline built around merge queue and one immutable release candidate.

A lightweight `Queue Admission` job runs on `pull_request` only to satisfy GitHub merge queue entry requirements. It is not part of the deployment pipeline stage model. The real staged pipeline starts at Commit Stage on `merge_group`.

## Stages

### `Commit Stage`

Runs first, on integrated merge-queue code.

The required commit gate is intentionally scoped to the deployed surface:

- `api`
- `web`
- `db-tools`
- `contracts`
- `sdk`

Non-deployed code such as `apps/worker` stays in the repo but is out of the required merge-queue path.

### `Acceptance Stage`

Runs second, against the exact candidate produced by Commit.

Acceptance remains smoke-only on the required path:

- one system smoke
- one browser smoke

Broader exploratory or regression journeys belong outside the required merge-queue flow.

### `Release Stage`

Runs third, deploying the exact accepted candidate to Azure before `main` advances.

Stage apps stay at `minReplicas=0` for cost control, so Release still accepts the cold-start tradeoff instead of adding warm-up orchestration.

## Workflow topology

### `01 Development Pipeline`

The real pipeline and the only required status check path.

Triggers:

- `pull_request` for the lightweight queue-admission check
- `merge_group` for normal delivery
- `workflow_dispatch` with `candidate_id` for manual recovery redeploy of a previously released candidate

## Candidate flow

The key rule is:

- Commit builds and publishes the candidate once
- Acceptance and Release consume that exact candidate
- later stages do not rebuild images
- new candidates must pass Acceptance before Release can promote them

## Current production architecture

- one Azure production resource group
- one GitHub deployment environment: `production`
- long-lived ACA app pairs for stage/prod
- automatic release after Acceptance success on merge queue
- rare recovery redeploy of a previously released candidate

## Recovery policy

The preferred operational response is to fix forward with a new candidate through the normal pipeline.

Manual recovery redeploy exists only as a rare fallback. It:

- is only allowed for a previously released candidate
- verifies prior release attestation
- skips infra apply
- skips migrations
- still uses the same stage -> prod deployment flow

If the previous candidate is not compatible with the current database schema, recovery redeploy is unsupported and the correct response is a forward fix.

## Runtime visibility

The workflow summaries report basic elapsed time for Commit, Acceptance, and Release so operators can spot regressions. Those timings are informational. The first-order design concern is still the stage model:

- Commit is the first real stage and builds the candidate once
- Acceptance proves behavior on that same candidate
- Release promotes that same candidate
