# Scripts

## Purpose

The `scripts/` directory contains delivery pipeline control-plane automation.

## Pipeline Stage Boundaries

- `scripts/pipeline/commit/`: fast, merge-blocking checks and scope/docs/testing policy gate logic.
- `scripts/pipeline/acceptance/`: acceptance decision logic and release-candidate validation helpers used in deployment pipeline.
- `scripts/pipeline/production/`: production mutation helpers (infra apply, migration orchestration, smoke verification, release recording).
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
- Acceptance stage scripts: [`scripts/pipeline/acceptance/README.md`](./pipeline/acceptance/README.md)
- Production stage scripts: [`scripts/pipeline/production/README.md`](./pipeline/production/README.md)
- Shared scripts: [`scripts/pipeline/shared/README.md`](./pipeline/shared/README.md)
