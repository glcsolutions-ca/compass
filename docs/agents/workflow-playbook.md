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
3. `commit-stage` is the merge-blocking decision.
4. Merge queue runs the same commit-stage gate on `merge_group`.
5. Merge to `main` triggers `deployment-pipeline.yml`.
6. Deployment pipeline runs commit checks, freezes candidate digest refs, and loads candidate contract.
7. Deployment pipeline acceptance stage validates the same candidate and emits one yes/no decision.
8. Deployment pipeline production stage promotes accepted candidate refs with production lock.
9. Deployment pipeline release decision writes `.artifacts/release/<sha>/decision.json` as canonical release verdict.

## Governance Invariant

- `main` required check context is only `commit-stage` with strict checks enabled.
- Acceptance and production checks are never configured as branch-protection required contexts.

## High-Risk Paths

When scope includes `infra` or `identity`, expect control-plane approval via `production-control-plane` before production mutation.

Trusted Codex review remains available through manual `codex-review-trusted.yml` runs and does not block merges.
