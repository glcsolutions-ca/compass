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

`pnpm ci:preflight` now includes docs-drift enforcement. Run `pnpm ci:docs-drift` only when you
need focused local debugging of docs-drift behavior.

4. Confirm references and docs are updated if policy/workflow/scripting changed.

## CI/CD Cycle (Plain-English)

1. Open PR from a short-lived branch.
2. CI calculates risk tier from changed paths.
3. CI runs only the checks required for that tier.
4. `ci-pipeline` check name stays fixed, but mode is tier-driven:
   - `fast` for `t0`
   - `full` for `deps`, `t1`, `t2`, `t3`
   - commit-stage target: `t0` PRs should not start Postgres service containers
5. `risk-policy-gate` blocks merge unless current-head evidence is complete and valid.
6. Merge to `main` runs one release pipeline with four jobs: `classify`, `checks`, `promote`, `report`.
7. `classify` computes diff scope from `base_sha` (last successful production deployment SHA, with bootstrap fallback) to `head_sha`, then sets release kind:
   - `checks`: docs/control-plane only
   - `infra`: infra-only
   - `runtime`: app/runtime changes
8. `checks` does factory validation only and never touches production.
9. `promote` is the only production-mutating job (`environment: production`, `concurrency: prod-main`).
10. Stale guards run only before infra and before entering migration+deploy boundary.
11. Runtime releases build once, promote digest refs, run migration+deploy atomically, then run smoke + browser evidence.
12. Successful promotions are recorded in GitHub Deployments (`production`) and become the next `base_sha`.
13. Any failed gate blocks release; rerun only after a fix commit.

## High-Risk Paths

If a change resolves to higher tiers by policy, expect additional required evidence:

- `browser-evidence` for UI paths
- `harness-smoke` for high risk (`t3`)
- `codex-review` for high risk (`t3`) when `reviewPolicy.codexReviewEnabled=true`
- `actionlint` for changed workflow files during `risk-policy-preflight`
