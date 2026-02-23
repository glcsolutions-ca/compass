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
6. Merge to `main` creates a release candidate for that exact SHA.
7. Deploy pipeline runs migration job, deploys API/Web, then runs smoke and browser evidence.
8. Any failed gate blocks release; rerun only after a fix commit.

## High-Risk Paths

If a change resolves to higher tiers by policy, expect additional required evidence:

- `browser-evidence` for UI paths
- `harness-smoke` for high risk (`t3`)
- `codex-review` for high risk (`t3`) when `reviewPolicy.codexReviewEnabled=true`
