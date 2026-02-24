# Scripts

## Purpose

The `scripts/` directory contains delivery pipeline control-plane automation.

## Pipeline Stage Boundaries

- `scripts/pipeline/commit/`: fast, merge-blocking checks and scope/docs/testing policy gate logic.
- `scripts/pipeline/cloud/`: cloud deployment pipeline helpers, split by stage.
- `scripts/pipeline/desktop/`: desktop deployment pipeline acceptance/production helpers.
- `scripts/pipeline/shared/`: shared utilities, replay loaders, and workflow contract tests.

Commit and acceptance scripts must be non-production-mutating. Production scripts are allowed to mutate production only from guarded workflows.

## Artifact Conventions

- Commit stage artifacts: `.artifacts/commit-stage/`, `.artifacts/docs-drift/`, `.artifacts/testing-policy/`, `.artifacts/candidate/`.
- Acceptance stage artifacts: `.artifacts/acceptance/`, plus runtime evidence under `.artifacts/browser-evidence/`, `.artifacts/harness-smoke/`, `.artifacts/migration-image-smoke/`.
- Production stage artifacts: `.artifacts/production/`, `.artifacts/deploy/`, `.artifacts/infra/`, `.artifacts/identity/`.
- Canonical release verdict: `.artifacts/release/<sha>/decision.json`.

## Safety Notes

- Changes under `scripts/pipeline/**` are high-risk control-plane changes by policy.
- Keep changes small, preserve fail-closed behavior, and maintain machine-readable artifacts.

## Child READMEs

- Commit stage scripts: [`scripts/pipeline/commit/README.md`](./pipeline/commit/README.md)
- Cloud pipeline index: [`scripts/pipeline/cloud/README.md`](./pipeline/cloud/README.md)
- Cloud acceptance stage scripts: [`scripts/pipeline/cloud/acceptance/README.md`](./pipeline/cloud/acceptance/README.md)
- Cloud production stage scripts: [`scripts/pipeline/cloud/production/README.md`](./pipeline/cloud/production/README.md)
- Desktop pipeline scripts: [`scripts/pipeline/desktop/README.md`](./pipeline/desktop/README.md)
- Shared scripts: [`scripts/pipeline/shared/README.md`](./pipeline/shared/README.md)
