# Workflows

## Release Cycle (Plain-English)

1. PR runs `merge-contract.yml` and must pass `risk-policy-gate`.
2. Merge queue runs the same gate on `merge_group` before integration to `main`.
3. Merge to `main` runs `deploy.yml` as the single release orchestrator.
4. `deploy.yml` classifies each change as `checks`, `infra`, or `runtime`.
5. `checks` changes run factory checks only (no production mutation).
6. `infra` and `runtime` changes run `promote` (the only production-mutating job).
7. `runtime` runs migration+deploy atomically using digest refs.
8. `report` publishes unified release artifacts.

## Local Guardrails

Use these local checks to reduce format-only and policy drift failures in CI:

- `pnpm check:quick` runs the fast pre-merge contract (`format`, `lint`, `typecheck`, and merge-contract unit tests).
- `pnpm hooks:install` configures repo-local git hooks (`.githooks`).
- Installed hooks run:
  - `pre-commit`: `pnpm exec lint-staged`
  - `pre-push`: `pnpm check:quick`

- `merge-contract.yml`: deterministic PR gate with dependency-based parallel checks:
  - triggers on `pull_request` and `merge_group`
  - `risk-policy-preflight` (includes `docs-drift` evaluation)
  - `actionlint` on changed workflow files only
  - `ci-pipeline` (single stable CI check name; `fast` for `low`, `full` for `standard/high`)
  - `browser-evidence` (conditional)
  - `harness-smoke` (conditional)
  - `migration-image-smoke` (conditional for high-tier migration/runtime path changes)
  - `risk-policy-gate` (final required gate; validates required outcomes from `needs.*.result`)
- `codex-review-trusted.yml`: optional manual `workflow_dispatch` trusted-context codex review for PR diffs; non-blocking and outside the merge gate
- `dependabot-auto-merge.yml`: safe-lane auto-merge for Dependabot PRs (patch/minor only) with required gate-context checks (`risk-policy-gate`, `ci-pipeline`) before enabling auto-merge
- `deploy.yml`: mainline release orchestrator (`classify -> checks -> promote -> report`)
  - `promote` is the only job with `environment: production` and `concurrency: prod-main`
  - classification base uses the last successful production deployment SHA (bootstrap fallback if none exists)
  - stale candidates are skipped at exactly two irreversible boundaries (pre-infra and pre-migration/deploy)
  - runtime promotion uses digest refs only (`repo@sha256`), not tags
  - migration+deploy is one atomic boundary (no stale abort between migration and deploy)
  - runs API smoke and browser evidence against baseline health/openapi and UI flow checks
  - enforces drift policy (`single` mode, `minReplicas=0`, `maxReplicas=1`, `cpu=0.25`, `memory=0.5Gi`, `maxInactiveRevisions<=2`, active revision == latest revision)
  - infra apply retries once for recognized transient ARM/ACA provisioning errors, then fails with terminal diagnostics
  - records successful production promotions in GitHub Deployments for deterministic base-SHA tracing
- `infra-apply.yml`: Azure Bicep infra apply workflow (`workflow_call` + manual dispatch; no push trigger)
  - provider registration preflight
  - validates private Postgres DNS zone suffix (`*.postgres.database.azure.com`)
  - validates Burstable Postgres SKU pairing (`POSTGRES_SKU_NAME` starts with `Standard_B`)
  - optional custom domain wiring via GitHub environment vars (`ACA_API_CUSTOM_DOMAIN`, `ACA_WEB_CUSTOM_DOMAIN`, `ACA_CUSTOM_DOMAIN_VALIDATION_METHOD`)
  - explicit ACR `authentication-as-arm` convergence check/enable
  - validates supplied workflow-call image refs exist in ACR before apply
  - retries once for recognized transient ARM/ACA provisioning failures
  - single shared runtime parameter payload for validate/create
  - workflow-call contract requires explicit image refs (`api_image_ref`, `web_image_ref`)
- `acr-cleanup.yml`: scheduled/manual ACR tag cleanup for cost control
  - keeps newest 15 tags by default per repository (`compass-api`, `compass-web`)
  - emits machine-readable artifact under `.artifacts/infra/<sha>/acr-cleanup.json`
- `identity-plan.yml`: Terraform identity plan workflow for `infra/identity/**` (GitHub Environment `production`)
- `identity-apply.yml`: manual Terraform identity apply workflow (GitHub Environment `production`)

Related references:

- Policy contract: `.github/policy/merge-policy.json`
- Agent docs: `docs/agents/README.md`
- Governance verification: `docs/runbooks/github-governance-verification.md`
