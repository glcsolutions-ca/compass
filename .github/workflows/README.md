# Workflows

## Cloud And Desktop Deployment Pipeline Model

1. PRs and merge queue runs use `commit-stage.yml` and must pass `commit-stage`.
2. `main` commits run the Cloud Deployment Pipeline (`cloud-deployment-pipeline.yml`).
3. `main` commits also run the Desktop Deployment Pipeline (`desktop-deployment-pipeline.yml`).
4. Each deployment pipeline emits a binary release decision (`YES` or `NO`) for its deployable.
5. Branch protection requires only `commit-stage`.
6. Cloud and desktop promotion are decoupled; desktop signing/notarization does not gate cloud production mutation.

## Workflow Index

- `commit-stage.yml`
  - trigger: `pull_request`, `merge_group` on `main`
  - merge-blocking required context: `commit-stage`
  - key jobs: `determine-scope`, change-aware `fast-feedback` (runtime/infra/identity/control-plane), change-aware `desktop-fast-feedback` (desktop), optional static checks, `commit-stage`
  - artifact: `.artifacts/commit-stage/<sha>/timing.json`
- `cloud-deployment-pipeline.yml` (cloud runtime/infra/identity)
  - trigger: `push` to `main`, `workflow_dispatch` replay by `candidate_sha`
  - stage groups: commit -> candidate freeze -> acceptance -> production -> release decision
  - final artifact: `.artifacts/release/<sha>/decision.json`
- `desktop-deployment-pipeline.yml` (desktop installers)
  - trigger: `push` to `main`, `workflow_dispatch` replay by `candidate_sha`
  - stage groups: desktop commit -> desktop acceptance (backend compatibility contract + signed macOS + signed Windows) -> desktop production -> desktop release decision
  - final artifact: `.artifacts/desktop-release/<sha>/decision.json`
- `desktop-release.yml`
  - manual compatibility workflow for one transition cycle
  - signed-only release publication path
- `acr-cleanup.yml`
  - scheduled/manual container registry cleanup
- `codex-review-trusted.yml`
  - optional trusted-context review helper
- `dependabot-auto-merge.yml`
  - safe-lane Dependabot auto-merge

## Environment Separation

- Acceptance jobs run in `acceptance` with read-only credentials.
- Cloud production mutation runs in `production`.
- Cloud infra/identity mutation requires `production-control-plane` approval when control-plane scope is present.
- Desktop signing/publishing runs in `desktop-release`.

## Identity Variable Naming

Identity checks resolve `API_IDENTIFIER_URI` first and fall back to legacy `ENTRA_AUDIENCE`.
If both are set and different, acceptance/production fail closed before Terraform mutation.

## Related References

- Policy contract: `.github/policy/pipeline-policy.json`
- Branch protection baseline: `docs/branch-protection.md`
- Commit-stage policy: `docs/commit-stage-policy.md`
- Cloud production runbook: `docs/runbooks/production-stage.md`
- Desktop deployment pipeline runbook: `docs/runbooks/desktop-deployment-pipeline.md`
