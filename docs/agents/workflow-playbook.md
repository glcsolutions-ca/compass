# Workflow Playbook

## Standard Agent Loop

1. Make scoped code/doc changes.
2. Run required local checks:

```bash
pnpm test
pnpm build
```

3. For delivery-config changes, run contract-focused commands:

```bash
pnpm commit:scope
pnpm commit:testing-policy
pnpm commit:docs-drift
```

4. Update docs when policy/workflow/scripting behavior changes.

## CI/CD Cycle (Plain Language)

1. Open PR from a short-lived branch.
2. `commit-stage.yml` computes scope and runs fast required checks.
3. `commit-stage` is the merge-blocking decision.
4. Merge queue runs the same gate on `merge_group`.
5. Merge to `main` triggers:

- `cloud-delivery-pipeline.yml` (cloud runtime/infra/identity)
- `desktop-deployment-pipeline.yml` (desktop installers)

6. Cloud pipeline verifies commit-stage evidence, builds release package refs, and publishes release package manifest.
7. Cloud acceptance validates that same release package and emits one YES/NO decision.
8. Cloud production promotes the accepted release package under the production lock.
9. Cloud release decision writes `.artifacts/release/<sha>/decision.json`.
10. Desktop release decision writes `.artifacts/desktop-release/<sha>/decision.json`.

## Governance Invariant

- `main` required check context is only `commit-stage`.
- Acceptance and production checks are post-merge release controls, not branch-protection required checks.

## High-Risk Paths

When scope includes `infra` or `identity`, expect production mutation plus deterministic post-deploy verification.
