# Agent Knowledge Store

This directory contains operational guidance for coding and review agents working in Compass.

## Documents

- [`operating-model.md`](operating-model.md)
- [`workflow-playbook.md`](workflow-playbook.md)
- [`troubleshooting.md`](troubleshooting.md)

## Local CI Fast Path

- Hooks are auto-installed during `pnpm install` (`prepare` runs `pnpm git-hooks:install`).
- `git-hooks:install` prefers worktree-local Git config (`git config --worktree`) so each worktree keeps its own hook path.
- If scripts are disabled during install, run `pnpm git-hooks:install` manually once per clone.
- Pre-commit and pre-push are local commit-test-suite ergonomics:
  - `.githooks/pre-commit` runs `pnpm git-hooks:pre-commit` (`pnpm test:quick`) for fast commit-stage feedback.
  - `.githooks/pre-push` runs `pnpm git-hooks:pre-push` (`pnpm test:full`) for deep local confidence before push.
- Full correctness remains in CI gates (`.github/workflows/commit-stage.yml` and `.github/workflows/integration-gate.yml`).

## Delivery Links

- Policy contract: [`../../.github/policy/pipeline-policy.json`](../../.github/policy/pipeline-policy.json)
- Commit workflow: [`../../.github/workflows/commit-stage.yml`](../../.github/workflows/commit-stage.yml)
- Integration workflow: [`../../.github/workflows/integration-gate.yml`](../../.github/workflows/integration-gate.yml)
- Cloud deployment pipeline workflow: [`../../.github/workflows/cloud-deployment-pipeline.yml`](../../.github/workflows/cloud-deployment-pipeline.yml)
- Cloud deployment pipeline replay workflow: [`../../.github/workflows/cloud-deployment-pipeline-replay.yml`](../../.github/workflows/cloud-deployment-pipeline-replay.yml)
- Desktop deployment pipeline workflow: [`../../.github/workflows/desktop-deployment-pipeline.yml`](../../.github/workflows/desktop-deployment-pipeline.yml)
- Policy docs: [`../commit-stage-policy.md`](../commit-stage-policy.md)
