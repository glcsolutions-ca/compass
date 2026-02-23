# Workflow Playbook

## Standard Agent Loop

1. Make scoped code/doc changes.
2. Run required local checks:

```bash
pnpm test
pnpm build
```

3. For control-plane changes, run contract-focused commands:

```bash
pnpm ci:preflight
pnpm ci:pipeline
pnpm ci:gate
```

`pnpm ci:preflight` includes docs-drift enforcement. Use `pnpm ci:docs-drift` only for focused debugging.

4. Confirm docs are updated when policy/workflow/scripting behavior changes.

## CI/CD Cycle (Plain-English)

1. Open PR from a short-lived branch.
2. CI computes tier from changed paths.
3. CI runs required checks in parallel after preflight.
4. `ci-pipeline` check name is fixed; mode is tier-driven:
   - `fast` for `low` (`pnpm test`)
   - `full` for `standard` and `high` (`pnpm test:full` + `pnpm build`)
   - target: `low` PRs should not start Postgres containers
5. `risk-policy-gate` blocks merge unless required evidence is complete and valid for both `headSha` and `testedSha`.
6. `merge-contract.yml` runs on `pull_request` and `merge_group` so queue execution uses the same gate.
7. Merge queue converges `main`; direct admin bypass is not part of normal flow.
8. Merge to `main` runs one release pipeline: `classify`, `checks`, `promote`, `report`.
9. `classify` diffs `base_sha` (last successful production deployment SHA) to `head_sha`.
10. `promote` is the only production-mutating job (`environment: production`, `concurrency: prod-main`).
11. Stale guards run only before infra and before migration+deploy boundary.
12. Runtime releases build once, promote digest refs, run migration+deploy atomically, then run smoke + browser evidence.
13. Successful promotions are recorded in GitHub Deployments (`production`) and become the next `base_sha`.

## High-Risk Paths

When tier resolves to `high`, expect additional required evidence:

- `harness-smoke`
- `actionlint` when workflow files changed

Trusted Codex review remains available through manual `codex-review-trusted.yml` runs and does not block merges.
