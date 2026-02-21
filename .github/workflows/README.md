# Workflows

- `merge-contract.yml`: deterministic merge-contract workflow with ordered checks:
  - `risk-policy-preflight` (includes `docs-drift` evaluation)
  - `codex-review` (fast no-op when policy does not require review)
  - `ci-pipeline`
  - `browser-evidence` (conditional)
  - `harness-smoke` (conditional)
  - `risk-policy-gate` (final required gate; check-run aggregation + browser manifest assertions)

Related references:

- Policy contract: `.github/policy/merge-policy.json`
- Agent docs: `docs/agents/README.md`
