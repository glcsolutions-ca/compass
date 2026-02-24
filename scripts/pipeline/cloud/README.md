# Cloud Pipeline Scripts

## Purpose

`scripts/pipeline/cloud/` contains cloud-only deployment pipeline logic.
Desktop pipeline code is intentionally kept in `scripts/pipeline/desktop/`.

## Stage Split

- `acceptance/`: non-mutating acceptance checks and YES/NO decision logic for cloud release candidates.
- `production/`: guarded production mutation helpers and production-stage decision logic.

## References

- Cloud workflow: `.github/workflows/cloud-deployment-pipeline.yml`
- Acceptance scripts: [`scripts/pipeline/cloud/acceptance/README.md`](./acceptance/README.md)
- Production scripts: [`scripts/pipeline/cloud/production/README.md`](./production/README.md)
