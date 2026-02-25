# Workflows

## Delivery Model

1. PRs run `commit-stage.yml` for commit-test suite and merge readiness.
2. Integration batching runs `integration-gate.yml` on the exact queued merge result.
3. A merge to `main` runs cloud deployment pipeline in `cloud-deployment-pipeline.yml`.
4. Desktop delivery runs independently in `desktop-deployment-pipeline.yml`.
5. Replay is separate and manual in `cloud-deployment-pipeline-replay.yml`.
6. Required gate contexts:

- PR gate: `commit-stage`
- Integration gate: `integration-gate`

## Workflow Index

- `commit-stage.yml`
  - trigger: `pull_request` (`opened`, `synchronize`, `reopened`, `ready_for_review`), `merge_group`
  - required check: `commit-stage`
  - key jobs: `determine-scope`, scope-aware `commit-test-suite`, scope-aware `desktop-commit-test-suite`, optional static checks, final `commit-stage`
  - behavior: heavy checks run only on `pull_request`; `merge_group` emits required `commit-stage` context for queue SHAs
  - key artifact: `.artifacts/commit-stage/<sha>/timing.json`

- `integration-gate.yml`
  - trigger: `pull_request` (`opened`, `synchronize`, `reopened`, `ready_for_review`), `merge_group`
  - required check: `integration-gate`
  - key jobs: `determine-scope` (always), merge-group-only checks `build-compile`, `migration-safety`, `auth-critical-smoke`, `minimal-integration-smoke`, final `integration-gate`
  - key artifacts:
    - `.artifacts/integration-gate/<sha>/result.json`
    - `.artifacts/integration-gate/<sha>/timing.json`

- `cloud-deployment-pipeline.yml`
  - trigger: `push` to `main`
  - key flow (Farley language):
    - Integration Confidence: `verify-commit-stage-evidence`, `verify-integration-gate-evidence`, `determine-scope`
    - Build Once: `build-release-candidate-api-image`, `build-release-candidate-web-image`, `build-release-candidate-codex-image`, `capture-current-runtime-refs`, `publish-release-candidate`
    - Promote, Don't Rebuild: `load-release-candidate`
    - Automated Acceptance Test Gate: runtime + infra + identity acceptance jobs, then `automated-acceptance-test-gate`
    - Continuous Delivery: `deploy-release-candidate` (when acceptance is YES and deploy is required)
    - Production Verification: `production-blackbox-verify`, then `deployment-stage`
    - Release on Demand evidence: `release-decision`
  - key artifacts:
    - `.artifacts/release-candidate/<sha>/manifest.json`
    - `.artifacts/release/<sha>/decision.json`
    - `.artifacts/pipeline/<sha>/timing.json`

- `cloud-deployment-pipeline-replay.yml`
  - trigger: `workflow_dispatch`
  - required input: `release_candidate_sha`
  - purpose: rerun automated-acceptance-test-gate -> deployment-stage verification for the same release candidate (no rebuild)

- `desktop-deployment-pipeline.yml`
  - trigger: `push` to `main`, `workflow_dispatch`
  - purpose: signed desktop installer delivery

- Auth verification for cloud release happens inside `production-blackbox-verify` in:
  - `cloud-deployment-pipeline.yml`
  - `cloud-deployment-pipeline-replay.yml`
  - scope: app-only allowed/denied/invalid API smoke checks against target SHA

## Environment Separation

- `acceptance`: non-mutating automated acceptance test gate checks.
- `production`: cloud deployment-stage mutation and deployment-stage verification.
- `desktop-release`: desktop signing and publishing.

## References

- Policy contract: `.github/policy/pipeline-policy.json`
- Branch protection baseline: `docs/branch-protection.md`
- Commit-stage policy: `docs/commit-stage-policy.md`
- Cloud deployment pipeline runbook: `docs/runbooks/cloud-deployment-pipeline-setup.md`
