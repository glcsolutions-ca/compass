# Workflows

## Release Cycle (Plain-English)

1. PR runs `merge-contract.yml` and must pass `risk-policy-gate`.
2. Merge to `main` runs `deploy.yml` as the single release orchestrator.
3. `deploy.yml` classifies each change as `checks`, `infra`, or `runtime`.
4. `checks` changes run factory checks only (no production mutation).
5. `infra` and `runtime` changes run `promote` (the only production-mutating job).
6. `runtime` runs migration+deploy atomically using digest refs.
7. `report` publishes unified release artifacts.

- `merge-contract.yml`: deterministic merge-contract workflow with ordered checks:
  - `risk-policy-preflight` (includes `docs-drift` evaluation)
  - `no-org-infra` leak guard (fails on committed org-specific infra values)
  - `codex-review` (conditional; runs only when policy requires it)
  - `ci-pipeline-fast` (conditional lane for `t0`; lightweight repo checks, no Postgres service)
  - `ci-pipeline-full` (conditional lane for `deps`, `t1`, `t2`, `t3`; Postgres integration + full pipeline)
  - `ci-pipeline` (stable required check; validates lane selection and emits the ci artifact)
  - `browser-evidence` (conditional)
    - web smoke runs against Next standalone runtime with static/public assets copied into the standalone tree
  - `harness-smoke` (conditional)
  - `risk-policy-gate` (final required gate; policy-driven check aggregation + browser manifest assertions)
- `dependabot-auto-merge.yml`: metadata-only safe-lane auto-merge for Dependabot PRs (patch/minor only, no PR checkout)
- `deploy.yml`: mainline release orchestrator (`classify -> checks -> promote -> report`)
  - `validate` lane runs `actionlint` via pinned `rhysd/actionlint@v1.7.11` scoped to `deploy.yml`
  - `promote` is the only job with `environment: production` and `concurrency: prod-main`
  - stale candidates are skipped before irreversible boundaries
  - runtime promotion uses digest refs only (`repo@sha256`), not tags
  - migration+deploy is one atomic boundary (no stale abort between migration and deploy)
  - runs API smoke and browser evidence with test-time token injection (`BROWSER_SMOKE_BEARER_TOKEN`)
  - enforces drift policy (`single` mode, `minReplicas=0`, `maxReplicas=1`, `cpu=0.25`, `memory=0.5Gi`, `maxInactiveRevisions<=2`, active revision == latest revision)
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
