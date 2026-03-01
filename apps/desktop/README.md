# Desktop App

Purpose: local runtime host and desktop packaging target.

## Start Here

- source: `apps/desktop/src`
- packaging workflow: `.github/workflows/desktop-deployment-pipeline.yml`

## Run And Test

```bash
pnpm --filter @compass/desktop dev:run
pnpm --filter @compass/desktop test
```

## Source Of Truth

- `docs/runbooks/desktop-deployment-pipeline.md`
