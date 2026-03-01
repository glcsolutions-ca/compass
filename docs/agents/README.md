# Agent Docs

Canonical model: `../development-pipeline.md`.

## Files

- [`operating-model.md`](operating-model.md)
- [`workflow-playbook.md`](workflow-playbook.md)
- [`troubleshooting.md`](troubleshooting.md)

## Fast Path

- Commit loop: `pnpm test:quick`
- Before push: `pnpm test:full`
- Hook install: `pnpm git-hooks:install`
