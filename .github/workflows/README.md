# Workflows

## Delivery Cycle (Plain-English)

1. PRs run `commit-stage.yml` and must pass `commit-stage`.
2. Merge queue runs the same commit gate on `merge_group` before integrating to `main`.
3. Commits on `main` run `commit-stage.yml` again and produce a frozen candidate manifest.
4. Successful commit-stage runs on `main` trigger `acceptance-stage.yml`.
5. Acceptance stage validates the same candidate and emits one YES/NO gate.
6. Successful acceptance runs trigger `production-stage.yml`.
7. Production stage deploys the accepted candidate without rebuilding runtime images.

## Workflow Index

- `commit-stage.yml`
  - trigger: `pull_request`, `merge_group`, `push` to `main`
  - key jobs: `determine-scope`, `fast-feedback`, optional `infra-static-check`/`identity-static-check`, `freeze-release-candidate-images`, `publish-release-candidate`, `commit-stage`
  - emits timing telemetry at `.artifacts/commit-stage/<sha>/timing.json`
- `acceptance-stage.yml`
  - trigger: successful `Commit Stage` runs on `main` (`workflow_run`) or manual replay
  - key jobs: `acceptance-eligibility`, `load-release-candidate`, optional `runtime-blackbox-acceptance` / `infra-readonly-acceptance` / `identity-readonly-acceptance`, `acceptance-stage`
  - runtime acceptance must pull and run candidate digest refs (no local candidate rebuild path)
  - docs-only changes are explicit `not-required` outcomes
  - identity acceptance runs shared config-contract preflight before Terraform plan
- `production-stage.yml`
  - trigger: successful `Acceptance Stage` runs (`workflow_run`) or manual replay
  - key jobs: `production-eligibility`, `load-approved-candidate`, `freshness-check`, `deploy-approved-candidate`, `production-blackbox-verify`, `production-stage`
  - production identity apply runs the same shared identity config-contract preflight used by acceptance
- `acr-cleanup.yml`
  - scheduled/manual ACR cleanup
- `desktop-release.yml`
  - trigger: manual `workflow_dispatch`
  - key jobs: `validate-candidate`, parallel `build-macos`/`build-windows`, `publish-release`
  - outputs signed installers (`.dmg`, `.msi`), release checksums, and desktop release manifest artifact
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
- Desktop release runbook: `docs/runbooks/desktop-release.md`
- Identity IaC docs: `infra/identity/README.md`
