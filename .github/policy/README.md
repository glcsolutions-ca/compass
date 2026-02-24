# Pipeline Policy Contract

This directory is the machine source of truth for delivery stage control.

- Canonical contract: `.github/policy/pipeline-policy.json`
- Enforced by workflows: `.github/workflows/commit-stage.yml`, `.github/workflows/acceptance-stage.yml`, `.github/workflows/production-stage.yml`
- Required branch-protection check context: `commit-stage-gate`

`commit-stage-gate` is the single merge-blocking check context. Acceptance and production are post-merge stage gates.

## Policy Sections

- `scopeRules`: file-to-scope classification (`runtime`, `infra`, `identity`, `docsOnly`, rollout flags)
- `commitStage`: required commit checks plus timing SLO policy (`targetSeconds`, `mode`)
- `acceptanceStage`: required acceptance jobs by scope
- `productionStage`: production promotion safety toggles
- `docsDriftRules`: control-plane/docs-critical drift enforcement

## Commit-Stage SLO Mode

`commitStage.slo.mode` values:

- `observe`: timing breaches warn only, no merge block
- `enforce`: timing breaches fail `commit-stage-gate`

Current default is `observe`.

## Control-Plane Coverage

`pipeline-policy.json` treats delivery-control paths as high-risk control plane, including:

- `.github/workflows/**`
- `.github/policy/**`
- `scripts/pipeline/**`
- `infra/azure/**`
- `infra/identity/**`
- `deploy/**`

## Trusted Review

Secret-backed Codex review is not part of the blocking merge contract.

- Use `.github/workflows/codex-review-trusted.yml` with manual `workflow_dispatch` for trusted-context review.
- Treat trusted review findings as advisory unless an explicit blocking policy is added later.
