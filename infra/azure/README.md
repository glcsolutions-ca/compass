# Azure Infrastructure

Purpose: Bicep-managed runtime infrastructure for cloud deployment.

## Start Here

- templates: `infra/azure/**/*.bicep`
- env params: `infra/azure/environments/*.bicepparam`

## Run

```bash
node scripts/infra/bootstrap-cloud-environment.mjs
```

## Source Of Truth

- `docs/runbooks/cloud-deployment-pipeline-setup.md`
- `.github/workflows/cloud-deployment-pipeline.yml`
