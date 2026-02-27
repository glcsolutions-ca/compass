# Workflow Playbook

## Standard Agent Loop

1. Make one small, reversible change.
2. Run required local checks:

```bash
pnpm test:quick
pnpm test:full
pnpm build
```

`git commit` runs pre-commit autofix + gate:

```bash
pnpm exec lint-staged
pnpm test:quick
```

If `pnpm test:full` prints `FULL001 backend prerequisites missing`, run:

```bash
pnpm db:postgres:up
pnpm test:full
pnpm db:postgres:down
```

If `pnpm test:quick` prints `FMT001 formatting violations detected`, run:

```bash
pnpm exec lint-staged
# or full repo:
pnpm format
pnpm test:quick
```

Quick/unit output contract:

- Green runs: compact summaries only.
- Red runs: failed task logs and failing test diagnostics.

Deep diagnostics:

```bash
pnpm turbo run test --output-logs=full --ui=stream --log-order=grouped
pnpm test:pipeline-contract -- --reporter=default
```

3. For deployment-pipeline-config changes, also run:

```bash
pnpm ci:scope
pnpm ci:testing-policy
pnpm ci:docs-drift
pnpm ci:terminology-policy
```

4. Keep docs and policy checks aligned with behavior changes.

## Trunk-First CI/CD Cycle

1. Push small commits to `main`.
2. `commit-stage.yml` runs fast commit-stage checks and emits decision evidence.
3. `integration-gate.yml` runs integration checks and emits decision evidence.
4. `cloud-deployment-pipeline.yml` verifies commit-stage/integration-gate push evidence for the same SHA.
5. Cloud pipeline builds once, publishes release candidate manifest, and promotes that same release candidate.
6. Automated acceptance test gate returns one YES/NO decision.
7. Deployment stage deploys only accepted release candidates.
8. Release decision writes `.artifacts/release/<sha>/decision.json`.
9. `main-red-recovery.yml` auto-reruns once, then auto-reverts repeated hard deterministic gate failures.

## High-Risk Mainline Rule

For commits on `main`, local static policy `HR001` blocks staged high-risk changes and routes work to PR flow.

Use the guidance printed by `HR001`: create a branch, commit, push, open PR, and request CODEOWNER review.

## Governance Invariant

- Branch protection keeps safety controls (enforce admins, no force-push, no deletion) while allowing direct pushes.
- `commit-stage` and `integration-gate` remain the authoritative push-time gate contexts.
- Legacy batching and PR-review gates are not required for `main`.
