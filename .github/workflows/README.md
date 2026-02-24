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
  - key jobs: commit group (`determine-scope`, `fast-feedback`, optional static checks, `commit-stage`)
  - candidate group: `freeze-candidate-api-image`, `freeze-candidate-web-image`, `freeze-current-runtime-refs`, `publish-release-candidate`, `load-release-candidate`
  - acceptance group: optional `runtime-api-system-acceptance` / `runtime-browser-acceptance` / `runtime-migration-image-acceptance` / `infra-readonly-acceptance` / `identity-readonly-acceptance`, `acceptance-stage` (`YES` or `NO`)
  - production group: conditional `deploy-approved-candidate`, `production-blackbox-verify`, `production-stage`
  - production blackbox auth contract: requires fresh nightly `auth-entra-canary` run and fresh `auth-delegated-smoke` run for target SHA
  - final gate: `release-decision` writes `.artifacts/release/<sha>/decision.json` and `.artifacts/pipeline/<sha>/timing.json`
  - no `workflow_run` chaining inside the core release path
- `desktop-deployment-pipeline.yml` (desktop installers)
  - trigger: `push` to `main`, `workflow_dispatch` replay by `candidate_sha`
  - stage groups: desktop commit -> desktop acceptance (backend compatibility contract + signed macOS + signed Windows) -> desktop production -> desktop release decision
  - final artifact: `.artifacts/desktop-release/<sha>/decision.json`
- `auth-entra-canary.yml`
  - trigger: nightly schedule + `workflow_dispatch`
  - key checks: runtime-minted allowed app token succeeds, denied app token returns configured deny code (default `assignment_denied`), invalid token returns `401`
  - emits `.artifacts/auth-canary/<sha>/result.json`
- `auth-delegated-smoke.yml`
  - trigger: `workflow_dispatch` only (operator-driven pre-deploy probe)
  - key checks: delegated token returns `200` and `caller.tokenType=delegated`
  - requires environment secret `AUTH_DELEGATED_PROBE_TOKEN` set immediately before probe run
  - emits `.artifacts/deploy/<sha>/delegated-smoke.json`
- `acr-cleanup.yml`
  - scheduled/manual ACR cleanup
- `desktop-release.yml`
  - manual compatibility workflow for one transition cycle
  - signed-only release publication path
- `codex-review-trusted.yml`
  - optional trusted-context review helper
- `dependabot-auto-merge.yml`
  - safe-lane Dependabot auto-merge

## Environment Separation

- Acceptance jobs run in `acceptance` with read-only credentials.
- Cloud production mutation runs in `production`.
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
