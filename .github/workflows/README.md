# Workflows

- `merge-contract.yml`: deterministic merge-contract workflow with ordered checks:
  - `risk-policy-preflight` (includes `docs-drift` evaluation)
  - `no-org-infra` leak guard (fails on committed org-specific infra values)
  - `codex-review` (fast no-op when policy does not require review)
  - `ci-pipeline`
  - `browser-evidence` (conditional)
  - `harness-smoke` (conditional)
  - `risk-policy-gate` (final required gate; check-run aggregation + browser manifest assertions)
- `dependabot-auto-merge.yml`: metadata-only safe-lane auto-merge for Dependabot PRs (patch/minor only, no PR checkout)
- `deploy.yml`: push-to-main production deploy using ACR + Azure Container Apps deploy action (GitHub Environment `production`)
  - derives ACR login server from `ACR_NAME`
  - verifies latest API/Web revision is traffic-serving
  - runs migration job, API smoke, and browser evidence
- `infra-apply.yml`: Azure Bicep infra apply workflow for `infra/azure/**` (GitHub Environment `production`)
  - provider registration preflight
  - single shared runtime parameter payload for validate/create
  - image resolution precedence: `image_tag` input > currently deployed image > current SHA
  - post-apply zero-traffic revision cleanup
- `identity-plan.yml`: Terraform identity plan workflow for `infra/identity/**` (GitHub Environment `production`)
- `identity-apply.yml`: manual Terraform identity apply workflow (GitHub Environment `production`)

Related references:

- Policy contract: `.github/policy/merge-policy.json`
- Agent docs: `docs/agents/README.md`
