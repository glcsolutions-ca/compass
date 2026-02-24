# TDR-003: Cloud Deployment Pipeline Visualization Model (Single Workflow)

## Status

Superseded by TDR-004

## Date

2026-02-24

## Summary

Keep the production release path in one authoritative workflow instead of introducing reusable-workflow wrappers only to make the GitHub graph look grouped.

## Context

- GitHub Actions visualization is a job DAG and does not support true nested/collapsible stage groups inside one workflow run.
- The current delivery model already uses Farley-aligned stage language and sequencing:
  - PR/merge-queue gate in `commit-stage.yml`
  - `main` release flow in the cloud delivery workflow with commit, acceptance, and production jobs
- Previous cross-workflow chaining produced ambiguous outcomes and troubleshooting overhead.
- The team requested clearer stage legibility without reintroducing orchestration complexity.

## Decision

- Keep a single authoritative cloud push workflow as the main release workflow.
- Keep `commit-stage.yml` as the only PR/merge-queue required merge gate.
- Do not add reusable-workflow wrappers solely for visual grouping at this time.
- Continue to improve readability through:
  - stable stage job naming (`commit-stage`, `acceptance-stage`, `production-stage`, `release-decision`)
  - concise workflow docs and runbooks
  - deterministic decision artifacts

## Public APIs / Interfaces / Types

- No application API or package contract changes.
- No branch protection contract changes (required context remains `commit-stage`).
- No deployment artifact schema changes from this decision.

## Alternatives Considered

1. Wrap each stage (`commit`, `acceptance`, `production`) in reusable workflows for cleaner top-level graph nodes.
2. Return to cross-trigger multi-workflow orchestration.
3. Keep single-workflow orchestration and improve naming/docs.

Option 3 was selected because it preserves deterministic orchestration while minimizing control-plane complexity.

## Consequences

- Pros:
  - one run shows the full commit -> acceptance -> production chain
  - simpler debugging and fewer trigger edge cases
  - stronger Farley alignment for "build once, promote same candidate"
- Cons:
  - graph remains a flat DAG and can still look busy for large runs
  - no click-to-drill nested stage UI in GitHub Actions today

## Revisit Conditions

Reconsider reusable stage wrappers only if both conditions are true:

1. troubleshooting or onboarding friction remains high after naming/docs cleanup, and
2. wrapper indirection can be added without weakening determinism or artifact traceability.

## References

- `.github/workflows/commit-stage.yml`
- `.github/workflows/cloud-delivery-pipeline.yml`
- `.github/workflows/cloud-delivery-replay.yml`
- `.github/workflows/README.md`
- `docs/commit-stage-policy.md`
- `docs/runbooks/cloud-delivery-pipeline.md`
