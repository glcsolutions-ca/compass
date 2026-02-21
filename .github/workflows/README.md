# Workflows

- `merge-contract.yml`: deterministic merge-contract workflow with ordered checks:
  - `preflight`
  - `docs-drift`
  - `codex-review` (no-op or full based on `reviewPolicy.codexReviewEnabled`)
  - `ci-pipeline`
  - `browser-evidence` (conditional)
  - `harness-smoke` (conditional)
  - `risk-policy-gate` (final required gate)

Related references:

- Policy contract: `.github/policy/merge-policy.json`
- Agent docs: `docs/agents/README.md`
