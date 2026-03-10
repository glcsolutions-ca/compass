# Pipeline Stages

The active stage model is:

1. `Commit Stage`
2. `Acceptance Stage`
3. `Release Stage`

Those stages are implemented inside:

- `20-continuous-delivery-pipeline.yml`

## Trigger map

- `pull_request` runs `10-pr-sync.yml`
- `push` to `main` runs the authoritative `Commit Stage`
- successful `Commit Stage` completion inside the same workflow runs `Acceptance Stage`
- successful `Acceptance Stage` completion inside the same workflow runs `Release Stage`

## Notes

- `In Sync` is the only required PR status check
- PR sync checking is preventive only and does not publish artifacts
- the CDP begins with integrated code on `main`, not on a PR head
