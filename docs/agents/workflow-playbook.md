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
2. `commit-stage.yml` computes scope and runs fast required checks by surface (`fast-feedback` for runtime/control-plane, `desktop-fast-feedback` for desktop).
3. `commit-stage` is the merge-blocking decision.
4. Merge queue runs the same commit-stage gate on `merge_group`.
5. Merge to `main` triggers both deployment pipelines:
   - `cloud-deployment-pipeline.yml` for cloud runtime/infra/identity
   - `desktop-deployment-pipeline.yml` for desktop installers
6. Cloud pipeline runs commit checks, freezes candidate digest refs, and loads candidate contract.
7. Cloud acceptance stage validates the same candidate and emits one yes/no decision.
8. Cloud production stage promotes accepted candidate refs with production lock.
9. Cloud release decision writes `.artifacts/release/<sha>/decision.json` as canonical cloud release verdict.
10. Desktop release decision writes `.artifacts/desktop-release/<sha>/decision.json` as canonical desktop release verdict.

## Governance Invariant

- `main` required check context is only `commit-stage` with strict checks enabled.
- Acceptance and production checks are never configured as branch-protection required contexts.

## High-Risk Paths

When scope includes `infra` or `identity`, expect control-plane approval via `production-control-plane` before production mutation.

Trusted Codex review remains available through manual `codex-review-trusted.yml` runs and does not block merges.
