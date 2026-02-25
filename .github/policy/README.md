# Pipeline Policy Contract

This directory is the machine source of truth for delivery policy.

- Canonical contract: `.github/policy/pipeline-policy.json`
- Enforced by workflows:
  - `.github/workflows/commit-stage.yml`
  - `.github/workflows/integration-gate.yml`
  - `.github/workflows/cloud-deployment-pipeline.yml`
  - `.github/workflows/cloud-deployment-pipeline-replay.yml`
- `.github/workflows/desktop-deployment-pipeline.yml`
- Required gate contexts: `commit-stage`, `integration-gate`

Trunk-first default is direct integration to `main` with fast automated gates on push. `pull_request` runs remain optional preview signals.
Automated acceptance test gate and deployment stage are post-push gates.

## Policy Sections

- `scopeRules`: file-to-scope classification (`runtime`, `desktop`, `infra`, `identity`, `docsOnly`, rollout flags)
- `commitStage`: required commit-stage checks + commit SLO policy (`targetSeconds`, `mode`)
- `pairingPolicy`: high-risk scope policy (`highRiskScopes`, `trailerKey`)
- `integrationGate`: required integration checks
- `automatedAcceptanceTestGate`: required acceptance jobs by scope
- `deploymentStage`: production promotion safety toggles
- `cloudDeploymentPipeline`: cloud deployment timing SLO targets (`acceptance`, `production`)
- `desktopDeploymentPipeline`: desktop delivery checks, artifact contracts, and stage timing SLOs
- `docsDriftRules`: deployment-pipeline-config/docs-critical drift rules

## Commit-Stage SLO Mode

`commitStage.slo.mode` values:

- `observe`: timing breaches warn only
- `enforce`: timing breaches fail `commit-stage`

## High-Risk Coverage

`pipeline-policy.json` treats deployment-pipeline-config paths as high-risk, including:

- `.github/workflows/**`
- `.github/policy/**`
- `scripts/pipeline/**`
- `infra/azure/**`
- `infra/identity/**`
- `deploy/**`
