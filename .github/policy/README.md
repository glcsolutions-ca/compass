# Pipeline Policy Contract

This directory is the machine source of truth for delivery policy.

- Canonical contract: `.github/policy/pipeline-policy.json`
- Enforced by workflows:
  - `.github/workflows/commit-stage.yml`
  - `.github/workflows/cloud-delivery-pipeline.yml`
  - `.github/workflows/cloud-delivery-replay.yml`
  - `.github/workflows/desktop-deployment-pipeline.yml`
- Required branch-protection context: `commit-stage`

`commit-stage` is the single merge-blocking check. Acceptance and production are post-merge stages.

## Policy Sections

- `scopeRules`: file-to-scope classification (`runtime`, `desktop`, `infra`, `identity`, `docsOnly`, rollout flags)
- `commitStage`: required commit checks + commit SLO policy (`targetSeconds`, `mode`)
- `acceptanceStage`: required acceptance jobs by scope
- `productionStage`: production promotion safety toggles
- `cloudDeliveryPipeline`: cloud delivery timing SLO targets (`acceptance`, `production`)
- `desktopPipeline`: desktop delivery checks, artifact contracts, and stage timing SLOs
- `docsDriftRules`: delivery-config/docs-critical drift rules

## Commit-Stage SLO Mode

`commitStage.slo.mode` values:

- `observe`: timing breaches warn only
- `enforce`: timing breaches fail `commit-stage`

## High-Risk Coverage

`pipeline-policy.json` treats delivery-config paths as high-risk, including:

- `.github/workflows/**`
- `.github/policy/**`
- `scripts/pipeline/**`
- `infra/azure/**`
- `infra/identity/**`
- `deploy/**`
