# Pipeline Stages

The active stage model is:

1. `Commit Stage`
2. `Acceptance`
3. `Release`

Those stages are implemented across two workflows:

- `10-commit-stage.yml`
- `20-mainline-promotion.yml`

## Trigger Map

- `pull_request` runs `Commit Stage` in preflight mode only.
- `merge_group` runs the authoritative `Commit Stage`.
- `push` to `main` runs `Acceptance` then `Release`.
- `workflow_dispatch` runs recovery redeploy through `Release`.

## Notes

- `Commit Stage` is the only required merge-queue check.
- PR labels are metadata only and are applied inside `Commit Stage` preflight.
- The delivery pipeline begins with integrated code on `merge_group`, not with PR head builds.
