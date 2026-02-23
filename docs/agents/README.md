# Agent Knowledge Store

This directory contains operational guidance for coding and review agents working in Compass.

## Documents

- [`operating-model.md`](operating-model.md)
- [`workflow-playbook.md`](workflow-playbook.md)
- [`troubleshooting.md`](troubleshooting.md)

## Local CI Fast Path

- Install repo hooks once per clone: `pnpm hooks:install`
- Run the fast local merge-contract checks: `pnpm check:quick`
- Hook behavior:
  - `.githooks/pre-commit` runs `pnpm exec lint-staged`
  - `.githooks/pre-push` runs `pnpm check:quick`

## Control Plane Links

- Policy contract: [`../../.github/policy/merge-policy.json`](../../.github/policy/merge-policy.json)
- Workflow: [`../../.github/workflows/merge-contract.yml`](../../.github/workflows/merge-contract.yml)
- Policy docs: [`../merge-policy.md`](../merge-policy.md)
