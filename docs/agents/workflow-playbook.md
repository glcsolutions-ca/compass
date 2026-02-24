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
pnpm commit:scope
pnpm commit:testing-policy
pnpm commit:docs-drift
```

4. Confirm docs are updated when policy/workflow/scripting behavior changes.

## CI/CD Cycle (Plain-English)

1. Open PR from a short-lived branch.
2. `commit-stage.yml` computes scope and runs fast required checks.
3. `commit-stage-gate` is the merge-blocking decision.
4. Merge queue runs the same commit-stage gate on `merge_group`.
5. Merge to `main` reruns commit stage and emits a frozen candidate manifest.
6. `acceptance-stage.yml` validates the same candidate and emits one yes/no gate.
7. `production-stage.yml` promotes accepted candidate refs with production lock and stale guard.
8. Production stage runs smoke verification and records deployment evidence.

## Governance Invariant

- `main` required check context is only `commit-stage-gate` with strict checks enabled.
- Acceptance and production checks are never configured as branch-protection required contexts.

## High-Risk Paths

When scope includes `infra` or `identity`, expect additional acceptance and production work under `environment: production`.

Trusted Codex review remains available through manual `codex-review-trusted.yml` runs and does not block merges.
