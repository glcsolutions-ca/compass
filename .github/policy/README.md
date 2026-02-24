# Pipeline Policy Contract

This directory is the machine source of truth for delivery stage control.

- Canonical contract: `.github/policy/pipeline-policy.json`
- Enforced by workflows: `.github/workflows/commit-stage.yml`, `.github/workflows/cloud-deployment-pipeline.yml`, `.github/workflows/desktop-deployment-pipeline.yml`
- Required branch-protection check context: `commit-stage`

`commit-stage` is the single merge-blocking check context. Acceptance and production are post-merge stages inside the Cloud Deployment Pipeline (`cloud-deployment-pipeline.yml`).

## Policy Sections

- `scopeRules`: file-to-scope classification (`runtime`, `desktop`, `infra`, `identity`, `docsOnly`, rollout flags)
- `commitStage`: required commit checks plus timing SLO policy (`targetSeconds`, `mode`)
- `commitStage.requiredChecks` are interpreted with scope-aware semantics in workflow gate logic.
- `acceptanceStage`: required acceptance jobs by scope
- `productionStage`: production promotion safety toggles
- `cloudDeploymentPipeline`: post-merge cloud stage timing SLO targets (`acceptance`, `production`)
- `desktopPipeline`: desktop deployment pipeline checks, artifacts, and stage timing SLOs
- `docsDriftRules`: control-plane/docs-critical drift enforcement

`docsOnly` paths are subtracted from mutable scope classification so documentation updates fail closed only through policy checks, not production mutation paths.

## Commit-Stage SLO Mode

`commitStage.slo.mode` values:

- `observe`: timing breaches warn only, no merge block
- `enforce`: timing breaches fail `commit-stage`

Current mode is `enforce`.

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
