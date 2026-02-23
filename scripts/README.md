# Scripts

## Purpose

The `scripts/` directory contains control-plane automation for CI policy enforcement and production release orchestration.

## CI vs Deploy Boundaries

- `scripts/ci/`: merge gating, risk classification, docs drift checks, and test-policy enforcement.
- `scripts/deploy/`: deployment/infra helpers, stale candidate guards, migration orchestration, and release evidence capture.

CI scripts should be non-production-mutating. Deploy scripts are allowed to mutate production when invoked by guarded workflows.

## Artifact Conventions

- CI artifacts are written under `.artifacts/merge/`, `.artifacts/testing-contract/`, `.artifacts/docs-drift/`, `.artifacts/risk-policy-gate/`.
- Deploy/runtime artifacts are written under `.artifacts/deploy/` and `.artifacts/infra/`.

## Safety Notes

- Changes under `scripts/ci/**` and `scripts/deploy/**` are treated as high-risk control-plane changes by merge policy.
- Keep script changes small, add/update tests where available, and preserve fail-closed behavior.

## Child READMEs

- CI scripts: [`scripts/ci/README.md`](./ci/README.md)
- Deploy scripts: [`scripts/deploy/README.md`](./deploy/README.md)
