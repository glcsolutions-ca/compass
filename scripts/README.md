# Scripts

## Purpose

The `scripts/` directory contains delivery automation for commit, acceptance, production, and release evidence.

## Pipeline Stage Boundaries

- `scripts/pipeline/commit/`: fast, merge-blocking checks and scope/docs/testing policy gates.
- `scripts/pipeline/cloud/`: cloud delivery helpers, split by acceptance and production.
- `scripts/pipeline/desktop/`: desktop delivery acceptance/production helpers.
- `scripts/pipeline/shared/`: shared utilities, replay loaders, and workflow contract tests.

Commit and acceptance scripts must stay non-mutating. Production scripts may mutate production only from guarded workflows.

## Artifact Conventions

- Commit stage: `.artifacts/commit-stage/`, `.artifacts/docs-drift/`, `.artifacts/testing-policy/`
- Release package: `.artifacts/release-package/`
- Acceptance: `.artifacts/acceptance/`, plus runtime evidence under `.artifacts/browser-evidence/`, `.artifacts/harness-smoke/`, `.artifacts/migration-image-smoke/`
- Production: `.artifacts/production/`, `.artifacts/deploy/`, `.artifacts/infra/`, `.artifacts/identity/`
- Final release verdict: `.artifacts/release/<sha>/decision.json`

## Safety Notes

- Changes under `scripts/pipeline/**` are high-risk delivery-config changes.
- Keep changes small, preserve fail-closed behavior, and keep machine-readable artifacts.

## Child READMEs

- Commit stage scripts: [`scripts/pipeline/commit/README.md`](./pipeline/commit/README.md)
- Cloud pipeline index: [`scripts/pipeline/cloud/README.md`](./pipeline/cloud/README.md)
- Cloud acceptance stage scripts: [`scripts/pipeline/cloud/acceptance/README.md`](./pipeline/cloud/acceptance/README.md)
- Cloud production stage scripts: [`scripts/pipeline/cloud/production/README.md`](./pipeline/cloud/production/README.md)
- Desktop pipeline scripts: [`scripts/pipeline/desktop/README.md`](./pipeline/desktop/README.md)
- Shared scripts: [`scripts/pipeline/shared/README.md`](./pipeline/shared/README.md)
