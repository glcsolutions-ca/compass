# Cloud Pipeline Scripts

## Purpose

`scripts/pipeline/cloud/` contains cloud-only deployment pipeline logic.
Desktop pipeline code is intentionally kept in `scripts/pipeline/desktop/`.

## Stage Split

- `automated-acceptance-test-gate/`: non-mutating acceptance checks and YES/NO decision logic for cloud release candidates.
- `deployment-stage/`: guarded production mutation helpers and deployment-stage decision logic.

## References

- Cloud push workflow: `.github/workflows/cloud-deployment-pipeline.yml`
- Cloud replay workflow: `.github/workflows/cloud-deployment-pipeline-replay.yml`
- Automated acceptance test gate scripts: [`scripts/pipeline/cloud/automated-acceptance-test-gate/README.md`](./automated-acceptance-test-gate/README.md)
- Deployment stage scripts: [`scripts/pipeline/cloud/deployment-stage/README.md`](./deployment-stage/README.md)
