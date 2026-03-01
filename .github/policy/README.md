# Pipeline Policy Contract

Purpose: machine source of truth for delivery policy.

## Policy File

- `.github/policy/pipeline-policy.json`

## What It Controls

- change scope rules
- required gate checks
- docs drift rules
- high-risk mainline policy (`HR001`)
- commit-stage and deployment SLO settings

## Editing Rule

When behavior changes in workflows or pipeline scripts, update this policy in the same change.

## Verification

- `pnpm ci:scope`
- `pnpm ci:docs-drift`
- `pnpm test:quick`
