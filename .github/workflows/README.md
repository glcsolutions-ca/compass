# Workflows

- `merge-contract.yml`: deterministic merge-contract workflow with ordered checks:
  - `risk-policy-preflight` (includes `docs-drift` evaluation)
  - `no-org-infra` leak guard (fails on committed org-specific infra values)
  - `codex-review` (fast no-op when policy does not require review)
  - `ci-pipeline`
  - `browser-evidence` (conditional)
    - web smoke runs against Next standalone runtime with static/public assets copied into the standalone tree
  - `harness-smoke` (conditional)
  - `risk-policy-gate` (final required gate; check-run aggregation + browser manifest assertions)
- `dependabot-auto-merge.yml`: metadata-only safe-lane auto-merge for Dependabot PRs (patch/minor only, no PR checkout)
- `deploy.yml`: push-to-main production deploy using ACR + Azure Container Apps deploy action (GitHub Environment `production`)
  - migration job runs before API/Web rollout (expand-first gate)
  - API image is shared by runtime and migration command path (single-image pattern)
  - API and Web images are both built/pushed explicitly, then deployed via `imageToDeploy`
  - derives ACR login server from `ACR_NAME`
  - runs subscription-scoped drift assertions before switching to subscription-less smoke identity
  - normalizes CLI mode output (`Single`/`single`) before drift-policy comparison
  - allows bounded convergence time for active revision count after deploy (up to 120s)
  - runs API smoke and browser evidence with test-time token injection (`BROWSER_SMOKE_BEARER_TOKEN`)
  - asserts post-deploy drift policy (`single` revision mode, `minReplicas=0`, `maxReplicas=1`, `cpu=0.25`, `memory=0.5Gi`, `maxInactiveRevisions<=2`, one active revision per app)
- `infra-apply.yml`: Azure Bicep infra apply workflow for `infra/azure/**` (GitHub Environment `production`)
  - provider registration preflight
  - explicit ACR `authentication-as-arm` convergence check/enable
  - single shared runtime parameter payload for validate/create
  - image resolution precedence: `image_tag` input > currently deployed image > current SHA
- `acr-cleanup.yml`: scheduled/manual ACR tag cleanup for cost control
  - keeps newest N tags per repository (`compass-api`, `compass-web`)
  - emits machine-readable artifact under `.artifacts/infra/<sha>/acr-cleanup.json`
- `identity-plan.yml`: Terraform identity plan workflow for `infra/identity/**` (GitHub Environment `production`)
- `identity-apply.yml`: manual Terraform identity apply workflow (GitHub Environment `production`)

Related references:

- Policy contract: `.github/policy/merge-policy.json`
- Agent docs: `docs/agents/README.md`
