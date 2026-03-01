# Desktop Deployment Pipeline Runbook

Purpose: operate desktop release workflow independent from cloud runtime delivery.

## When To Use

- packaging and publishing desktop installers
- replaying desktop release candidate publication

## Inputs

- desktop release candidate SHA
- signing/notarization credentials where required

## Steps

1. Run desktop deployment workflow.
2. Verify automated acceptance gate results.
3. Verify deployment stage outputs and published artifacts.
4. Publish or replay accepted release candidate.

## Verify

- desktop release decision artifact is YES
- expected installer artifacts are attached to release output

## Failure Handling

- fix signing/notarization/config and rerun
- do not block cloud runtime releases for desktop-only failures
