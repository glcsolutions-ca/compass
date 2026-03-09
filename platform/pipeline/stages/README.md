# Pipeline Stages

The active stage model is:

1. `Commit Stage`
2. `Acceptance`
3. `Release`

Those stages are implemented across three stage workflows:

- `10-commit-stage.yml`
- `20-acceptance.yml`
- `30-release.yml`

## Trigger Map

- `pull_request` runs `05-pr-labels.yml` and the no-op queue-admission `Commit Stage` status.
- `merge_group` runs the authoritative `Commit Stage`.
- successful `Commit Stage` completion runs `Acceptance`.
- successful `Acceptance` completion runs `Release`.

## Notes

- `Commit Stage` is the only required merge-queue check.
- PR labels are metadata only and run outside the stage pipeline.
- The PR-head `Commit Stage` run is queue admission only; it does not build or publish artifacts.
- The delivery pipeline begins with integrated code on `merge_group`, not with PR head builds.
