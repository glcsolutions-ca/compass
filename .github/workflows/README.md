# Workflows

## Delivery Model

1. PRs run `commit-stage.yml` for fast feedback and merge readiness.
2. Merge queue runs `merge-queue-gate.yml` on the exact queued merge result.
3. A merge to `main` runs cloud delivery in `cloud-delivery-pipeline.yml`.
4. Desktop delivery runs independently in `desktop-deployment-pipeline.yml`.
5. Replay is separate and manual in `cloud-delivery-replay.yml`.
6. Required gate contexts:

- PR gate: `commit-stage`
- Merge queue gate: `merge-queue-gate`

## Workflow Index

- `commit-stage.yml`
  - trigger: `pull_request` (`opened`, `synchronize`, `reopened`, `ready_for_review`), `merge_group`
  - required check: `commit-stage`
  - key jobs: `determine-scope`, scope-aware `fast-feedback`, scope-aware `desktop-fast-feedback`, optional static checks, final `commit-stage`
  - behavior: heavy checks run only on `pull_request`; `merge_group` emits required `commit-stage` context for queue SHAs
  - key artifact: `.artifacts/commit-stage/<sha>/timing.json`

- `merge-queue-gate.yml`
  - trigger: `pull_request` (`opened`, `synchronize`, `reopened`, `ready_for_review`), `merge_group`
  - required check: `merge-queue-gate`
  - key jobs: `determine-scope` (always), merge-group-only checks `build-compile`, `migration-safety`, `auth-critical-smoke`, `minimal-integration-smoke`, final `merge-queue-gate`
  - key artifacts:
    - `.artifacts/merge-queue-gate/<sha>/result.json`
    - `.artifacts/merge-queue-gate/<sha>/timing.json`

- `cloud-delivery-pipeline.yml`
  - trigger: `push` to `main`
  - key flow (Farley language):
    - Integration Confidence: `verify-commit-stage-evidence`, `verify-merge-queue-gate-evidence`, `determine-scope`
    - Build Once: `build-release-package-api-image`, `build-release-package-web-image`, `build-release-package-codex-image`, `capture-current-runtime-refs`, `publish-release-package`
    - Promote, Don't Rebuild: `load-release-package`
    - Acceptance Stage: runtime + infra + identity acceptance jobs, then `acceptance-stage`
    - Continuous Delivery: `deploy-release-package` (when acceptance is YES and deploy is required)
    - Production Verification: `production-blackbox-verify`, then `production-stage`
    - Release on Demand evidence: `release-decision`
  - key artifacts:
    - `.artifacts/release-package/<sha>/manifest.json`
    - `.artifacts/release/<sha>/decision.json`
    - `.artifacts/pipeline/<sha>/timing.json`

- `cloud-delivery-replay.yml`
  - trigger: `workflow_dispatch`
  - required input: `release_package_sha`
  - purpose: rerun acceptance -> deploy -> production verification for the same release package (no rebuild)

- `desktop-deployment-pipeline.yml`
  - trigger: `push` to `main`, `workflow_dispatch`
  - purpose: signed desktop installer delivery

- `auth-entra-canary.yml`
  - trigger: nightly schedule + manual dispatch
  - purpose: app-only allow/deny auth checks against live Entra

- `auth-delegated-smoke.yml`
  - trigger: manual dispatch
  - purpose: delegated `/v1/me` probe for target SHA

- `desktop-release.yml`
  - manual compatibility lane for desktop release publication

## Environment Separation

- `acceptance`: non-mutating acceptance checks.
- `production`: cloud production mutation and production verification.
- `desktop-release`: desktop signing and publishing.

## References

- Policy contract: `.github/policy/pipeline-policy.json`
- Branch protection baseline: `docs/branch-protection.md`
- Commit-stage policy: `docs/commit-stage-policy.md`
- Cloud delivery runbook: `docs/runbooks/cloud-deployment-pipeline-setup.md`
