# Workflows

## Delivery Cycle (Plain-English)

1. PRs run `commit-stage.yml` and must pass `commit-stage`.
2. Merge queue runs the same commit gate on `merge_group` before integrating to `main`.
3. Commits on `main` run `deployment-pipeline.yml`.
4. Deployment pipeline performs commit checks, freezes candidate refs, runs acceptance, then runs production.
5. Production deploys accepted candidate digests only (no runtime image rebuild).
6. Deployment pipeline emits one canonical release decision artifact (`YES` or `NO`).
7. Docs-only, checks-only, and desktop-only commits return acceptance `YES` with no cloud production mutation.

## Workflow Index

- `commit-stage.yml`
  - trigger: `pull_request`, `merge_group` to `main`
  - key jobs: `determine-scope`, `fast-feedback`, optional `infra-static-check`/`identity-static-check`, `commit-stage`
  - merge-blocking required context: `commit-stage`
  - emits timing telemetry at `.artifacts/commit-stage/<sha>/timing.json`
- `deployment-pipeline.yml`
  - trigger: `push` to `main`, `workflow_dispatch` replay by `candidate_sha`
  - key jobs: commit group (`determine-scope`, `fast-feedback`, optional static checks, `commit-stage`)
  - candidate group: `freeze-candidate-api-image`, `freeze-candidate-web-image`, `freeze-current-runtime-refs`, `publish-release-candidate`, `load-release-candidate`
  - acceptance group: optional `runtime-api-system-acceptance` / `runtime-browser-acceptance` / `runtime-migration-image-acceptance` / `infra-readonly-acceptance` / `identity-readonly-acceptance`, `acceptance-stage` (`YES` or `NO`)
  - production group: conditional `approve-control-plane`, `deploy-approved-candidate`, `production-blackbox-verify`, `production-stage`
  - final gate: `release-decision` writes `.artifacts/release/<sha>/decision.json` and `.artifacts/pipeline/<sha>/timing.json`
  - no `workflow_run` chaining inside the core release path
- `acr-cleanup.yml`
  - scheduled/manual ACR cleanup
- `desktop-release.yml`
  - trigger: manual `workflow_dispatch`
  - key jobs: `validate-candidate`, parallel `build-macos`/`build-windows`, `publish-release`
  - supports `signing_mode` policy: `signed`, `unsigned`, `unsigned-macos`, `unsigned-windows`
  - supports `candidate_validation`: `strict` (default) and `main-only` (unsigned testing only)
  - outputs release installers/checksums plus desktop release manifest artifact
- `codex-review-trusted.yml`
  - optional trusted-context review helper
- `dependabot-auto-merge.yml`
  - safe-lane Dependabot auto-merge

## Local Guardrails

Use these local checks to reduce policy and drift failures in CI:

- `pnpm test`
- `pnpm test:full`
- `pnpm test:pipeline-contract`
- `pnpm commit:testing-policy`
- `pnpm commit:docs-drift`

## Identity Variable Naming

Identity workflows resolve `API_IDENTIFIER_URI` first and fall back to legacy `ENTRA_AUDIENCE`.
If both are set and different, acceptance and production fail closed before Terraform mutation.

## Environment Separation

- Acceptance jobs run in `acceptance` environment with read-only credentials.
- Production mutation runs in `production`.
- Infra/identity production mutation requires explicit `production-control-plane` approval when scope requires control-plane convergence.

## Related References

- Policy contract: `.github/policy/pipeline-policy.json`
- Branch protection baseline: `docs/branch-protection.md`
- Commit-stage policy: `docs/commit-stage-policy.md`
- Production runbook: `docs/runbooks/production-stage.md`
- Desktop release runbook: `docs/runbooks/desktop-release.md`
- Identity IaC docs: `infra/identity/README.md`
