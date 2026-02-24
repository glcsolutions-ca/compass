# Workflows

## Delivery Cycle (Plain-English)

1. PRs run `commit-stage.yml` and must pass `commit-stage-gate`.
2. Merge queue runs the same commit gate on `merge_group` before integrating to `main`.
3. Commits on `main` run `commit-stage.yml` again and produce a frozen candidate manifest.
4. Successful commit-stage runs on `main` trigger `acceptance-stage.yml`.
5. Acceptance stage validates the same candidate and emits one YES/NO gate.
6. Successful acceptance runs trigger `production-stage.yml`.
7. Production stage deploys the accepted candidate without rebuilding runtime images.

## Workflow Index

- `commit-stage.yml`
  - trigger: `pull_request`, `merge_group`, `push` to `main`
  - key jobs: `scope`, `quick-feedback`, optional infra/identity quick checks, `candidate-build` (on `main`), `commit-stage-gate`
  - emits timing telemetry at `.artifacts/commit-stage/<sha>/timing.json`
- `acceptance-stage.yml`
  - trigger: successful `Commit Stage` runs on `main` (`workflow_run`) or manual replay
  - key jobs: `load-candidate`, optional `runtime-acceptance` / `infra-acceptance` / `identity-acceptance`, `acceptance-stage-gate`
  - runtime acceptance must pull and run candidate digest refs (no local candidate rebuild path)
  - identity acceptance runs shared config-contract preflight before Terraform plan
- `production-stage.yml`
  - trigger: successful `Acceptance Stage` runs (`workflow_run`) or manual replay
  - key jobs: `load-accepted-candidate`, `stale-guard`, `production-mutate`, `post-deploy-verify`, `production-stage-result`
  - production identity apply runs the same shared identity config-contract preflight used by acceptance
- `acr-cleanup.yml`
  - scheduled/manual ACR cleanup
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

## Related References

- Policy contract: `.github/policy/pipeline-policy.json`
- Branch protection baseline: `docs/branch-protection.md`
- Commit-stage policy: `docs/commit-stage-policy.md`
- Production runbook: `docs/runbooks/production-stage.md`
- Identity IaC docs: `infra/identity/README.md`
