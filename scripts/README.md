# Scripts

## Purpose

The `scripts/` directory contains delivery automation for commit stage, automated acceptance test gate, deployment stage, and release evidence.
It also contains local developer bootstrap helpers under `scripts/dev/`.

## Pipeline Stage Boundaries

- `scripts/pipeline/commit/`: fast, merge-blocking checks and scope/docs/testing policy gates.
- `scripts/pipeline/cloud/`: cloud deployment pipeline helpers, split by automated acceptance test gate and deployment stage.
- `scripts/pipeline/desktop/`: desktop delivery automated acceptance test gate/deployment stage helpers.
- `scripts/pipeline/shared/`: shared utilities, replay loaders, and workflow contract tests.
- `scripts/dev/`: local development bootstrap helpers (for example `ensure-local-env.mjs`).

Commit-stage and automated acceptance test gate scripts must stay non-mutating. Deployment-stage scripts may mutate production only from guarded workflows.

## Artifact Conventions

- Commit stage: `.artifacts/commit-stage/`, `.artifacts/docs-drift/`, `.artifacts/testing-policy/`
- Release candidate: `.artifacts/release-candidate/`
- Automated acceptance test gate: `.artifacts/automated-acceptance-test-gate/`, plus runtime evidence under `.artifacts/browser-evidence/`, `.artifacts/harness-smoke/`, `.artifacts/migration-image-smoke/`
- Deployment stage: `.artifacts/deployment-stage/`, `.artifacts/deploy/`, `.artifacts/infra/`, `.artifacts/identity/`
- Final release verdict: `.artifacts/release/<sha>/decision.json`

## Safety Notes

- Changes under `scripts/pipeline/**` are high-risk deployment-pipeline-config changes.
- Keep changes small, preserve fail-closed behavior, and keep machine-readable artifacts.

## Child READMEs

- Commit stage scripts: [`scripts/pipeline/commit/README.md`](./pipeline/commit/README.md)
- Cloud pipeline index: [`scripts/pipeline/cloud/README.md`](./pipeline/cloud/README.md)
- Cloud automated acceptance test gate scripts: [`scripts/pipeline/cloud/automated-acceptance-test-gate/README.md`](./pipeline/cloud/automated-acceptance-test-gate/README.md)
- Cloud deployment stage scripts: [`scripts/pipeline/cloud/deployment-stage/README.md`](./pipeline/cloud/deployment-stage/README.md)
- Desktop pipeline scripts: [`scripts/pipeline/desktop/README.md`](./pipeline/desktop/README.md)
- Shared scripts: [`scripts/pipeline/shared/README.md`](./pipeline/shared/README.md)
