# Workflows

## Release Cycle (Plain-English)

1. PR runs `merge-contract.yml` and must pass `risk-policy-gate`.
2. Merge to `main` runs `deploy.yml` as the single release orchestrator.
3. `deploy.yml` classifies each change as `checks`, `infra`, or `runtime`.
4. `checks` changes run factory checks only (no production mutation).
5. `infra` and `runtime` changes run `promote` (the only production-mutating job).
6. `runtime` runs migration+deploy atomically using digest refs.
7. `report` publishes unified release artifacts.

- `merge-contract.yml`: deterministic PR gate with dependency-based parallel checks:
  - `risk-policy-preflight` (includes `docs-drift` evaluation)
  - `actionlint` on changed workflow files only
  - `no-org-infra` leak guard
  - `ci-pipeline` (single stable CI check name; `fast` for `low`, `full` for `standard/high`)
  - `browser-evidence` (conditional)
  - `harness-smoke` (conditional)
  - `risk-policy-gate` (final required gate; validates required outcomes from `needs.*.result`)
- `codex-review-trusted.yml`: manual trusted-context codex review for PR diffs (non-blocking to merge contract)
- `dependabot-auto-merge.yml`: safe-lane auto-merge for Dependabot PRs (patch/minor only) with required gate-context checks (`risk-policy-gate`, `ci-pipeline`) before enabling auto-merge
- `deploy.yml`: mainline release orchestrator (`classify -> checks -> promote -> report`)
  - `promote` is the only job with `environment: production` and `concurrency: prod-main`
  - classification base uses the last successful production deployment SHA (bootstrap fallback if none exists)
  - stale candidates are skipped at exactly two irreversible boundaries (pre-infra and pre-migration/deploy)
  - runtime promotion uses digest refs only (`repo@sha256`), not tags
  - migration+deploy is one atomic boundary (no stale abort between migration and deploy)
  - runs API smoke and browser evidence with test-time token injection (`BROWSER_SMOKE_BEARER_TOKEN`)
  - enforces drift policy (`single` mode, `minReplicas=0`, `maxReplicas=1`, `cpu=0.25`, `memory=0.5Gi`, `maxInactiveRevisions<=2`, active revision == latest revision)
  - records successful production promotions in GitHub Deployments for deterministic base-SHA tracing
- `infra-apply.yml`: Azure Bicep infra apply workflow (`workflow_call` + manual dispatch; no push trigger)
  - provider registration preflight
  - validates private Postgres DNS zone suffix (`*.postgres.database.azure.com`)
  - validates Burstable Postgres SKU pairing (`POSTGRES_SKU_NAME` starts with `Standard_B`)
  - explicit ACR `authentication-as-arm` convergence check/enable
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
