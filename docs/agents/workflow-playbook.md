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
pnpm ci:docs-drift
pnpm ci:codex-review
pnpm ci:pipeline
pnpm ci:gate
```

4. Confirm references and docs are updated if policy/workflow/scripting changed.

## High-Risk Paths

If a change resolves to higher tiers by policy, expect additional required evidence:

- `browser-evidence` for UI paths
- `harness-smoke` and full `codex-review` for high risk (`t3`)
