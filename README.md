# Compass

Purpose: one place to manage work, time, and delivery across the company.

## Start Here

- `docs/development-pipeline.md` for trunk-based delivery.
- `docs/runbooks/README.md` for operational procedures.
- `docs/contracts/` for runtime/auth contracts.

## Quick Start

Requirements:

- Node.js `22.x`
- `pnpm 10.30.1`
- Docker (local Postgres)

```bash
pnpm install
pnpm db:postgres:up
pnpm runtime:session:up
pnpm dev
```

## Run And Test

```bash
pnpm test:quick
pnpm test:full
pnpm build
```

If `FULL001` appears:

```bash
pnpm db:postgres:up
pnpm test:full
pnpm db:postgres:down
```

If `FMT001` appears:

```bash
pnpm exec lint-staged
# or full repo
pnpm format
pnpm test:quick
```

## Source Of Truth

- Pipeline policy: `.github/policy/pipeline-policy.json`
- Workflows: `.github/workflows/*.yml`
- Pipeline docs: `docs/development-pipeline.md`, `docs/commit-stage-policy.md`
- Infra docs: `infra/README.md`, `infra/azure/README.md`, `infra/identity/README.md`
