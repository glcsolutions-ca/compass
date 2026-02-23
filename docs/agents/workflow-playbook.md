# Workflow Playbook

## Standard Agent Loop

1. Make scoped code/doc changes.
2. Run required local checks:

```bash
pnpm check
pnpm build
```

3. For control-plane changes, run contract-focused commands:

```bash
pnpm ci:preflight
pnpm ci:codex-review
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
   - `fast` for `low`
   - `full` for `normal` and `high`
   - target: `low` PRs should not start Postgres containers
5. `risk-policy-gate` blocks merge unless current-head evidence is complete and valid.
6. Merge to `main` runs one release pipeline: `classify`, `checks`, `promote`, `report`.
7. `classify` diffs `base_sha` (last successful production deployment SHA) to `head_sha`.
8. `promote` is the only production-mutating job (`environment: production`, `concurrency: prod-main`).
9. Stale guards run only before infra and before migration+deploy boundary.
10. Runtime releases build once, promote digest refs, run migration+deploy atomically, then run smoke + browser evidence.
11. Successful promotions are recorded in GitHub Deployments (`production`) and become the next `base_sha`.

## High-Risk Paths

When tier resolves to `high`, expect additional required evidence:

- `harness-smoke`
- `codex-review` (when `reviewPolicy.codexReviewEnabled=true`)
- `actionlint` when workflow files changed
