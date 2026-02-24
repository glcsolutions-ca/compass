# Agent Knowledge Store

This directory contains operational guidance for coding and review agents working in Compass.

## Documents

- [`operating-model.md`](operating-model.md)
- [`workflow-playbook.md`](workflow-playbook.md)
- [`troubleshooting.md`](troubleshooting.md)

## Local CI Fast Path

- Install repo hooks once per clone: `pnpm hooks:install`
- Run the default commit-stage suite: `pnpm test`
- Hook behavior:
  - `.githooks/pre-commit` runs `pnpm exec lint-staged`
  - `.githooks/pre-push` runs `pnpm test`

## Delivery Links

- Policy contract: [`../../.github/policy/pipeline-policy.json`](../../.github/policy/pipeline-policy.json)
- Commit workflow: [`../../.github/workflows/commit-stage.yml`](../../.github/workflows/commit-stage.yml)
- Cloud delivery pipeline workflow: [`../../.github/workflows/cloud-delivery-pipeline.yml`](../../.github/workflows/cloud-delivery-pipeline.yml)
- Cloud delivery replay workflow: [`../../.github/workflows/cloud-delivery-replay.yml`](../../.github/workflows/cloud-delivery-replay.yml)
- Desktop deployment pipeline workflow: [`../../.github/workflows/desktop-deployment-pipeline.yml`](../../.github/workflows/desktop-deployment-pipeline.yml)
- Policy docs: [`../commit-stage-policy.md`](../commit-stage-policy.md)
