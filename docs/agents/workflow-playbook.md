# Workflow Playbook

## Standard Agent Loop

1. Make scoped code/doc changes.
2. Run required local checks:

```bash
pnpm test
pnpm build
```

3. For deployment-pipeline-config changes, run contract-focused commands:

```bash
pnpm ci:scope
pnpm ci:testing-policy
pnpm ci:docs-drift
```

4. Update docs when policy/workflow/scripting behavior changes.

## CI/CD Cycle (Plain Language)

1. Open PR from a short-lived branch.
2. `commit-stage.yml` computes scope and runs fast required checks.
3. `commit-stage` is the PR merge-readiness gate.
4. Integration batching runs `integration-gate.yml` on `merge_group` for exact-merge confidence.
5. Merge to `main` triggers:

- `cloud-deployment-pipeline.yml` (cloud runtime/infra/identity)
- `desktop-deployment-pipeline.yml` (desktop installers)

6. Cloud pipeline verifies integration-gate evidence, builds release candidate refs, and publishes release candidate manifest.
7. Cloud automated acceptance test gate validates that same release candidate and emits one YES/NO decision.
8. Cloud deployment stage promotes the accepted release candidate under the production environment lock.
9. Cloud release decision writes `.artifacts/release/<sha>/decision.json`.
10. Desktop release decision writes `.artifacts/desktop-release/<sha>/decision.json`.

## Governance Invariant

- Required gate contexts are `commit-stage` and `integration-gate`.
- Automated acceptance test gate and deployment stage checks are post-merge release controls, not branch-protection required checks.

## High-Risk Paths

When scope includes `infra` or `identity`, expect deployment-stage mutation plus deterministic post-deployment verification.
