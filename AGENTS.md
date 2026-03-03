# AGENTS.md

## Repo map

```text
compass/
├─ .github/workflows
├─ apps/{api,web,worker}
├─ db/{migrations,postgres,scripts,seeds}
├─ infra/{azure,identity}
├─ packages/{contracts,sdk,testkit}
├─ pipeline/{contracts,scripts,policies,runbooks}
├─ scripts/{dev,infra}
└─ tests/{acceptance,nonfunctional}
```

## Recommended structure (target)

Current layout may differ during migration; target is canonical.

```text
compass/
├─ .github/
│  └─ workflows/                     # orchestration only
├─ pipeline/                         # pipeline domain model + policy + tooling
│  ├─ contracts/
│  │  ├─ release-candidate-contract.md
│  │  ├─ schemas/
│  │  │  ├─ release-candidate.schema.json
│  │  │  ├─ acceptance-evidence.schema.json
│  │  │  └─ release-evidence.schema.json
│  │  └─ fixtures/
│  ├─ scripts/
│  │  ├─ generate-release-candidate.mjs
│  │  ├─ validate-release-candidate.mjs
│  │  ├─ fetch-release-candidate.mjs
│  │  ├─ deploy-from-manifest.mjs
│  │  ├─ verify-from-manifest.mjs
│  │  └─ verify-acceptance-evidence.mjs
│  ├─ policies/
│  │  └─ commit-analysis.config.json
│  └─ runbooks/
│     ├─ commit-stage-operating-model.md
│     ├─ acceptance-gate.md
│     └─ release-and-rollback.md
├─ apps/
│  ├─ api/
│  │  ├─ src/
│  │  └─ test/{unit,integration}
│  ├─ web/
│  │  ├─ src/
│  │  └─ test/{unit,component}
│  └─ worker/
│     ├─ src/
│     └─ test/{unit,integration}
├─ tests/
│  ├─ acceptance/
│  │  ├─ system/                     # cross-service business flows
│  │  └─ e2e/                        # browser/user journeys
│  └─ nonfunctional/
│     ├─ performance/
│     └─ security/
├─ db/
├─ infra/
├─ packages/
└─ scripts/
   ├─ dev/
   └─ infra/
```

## Main commands

- `pnpm install` — install workspace dependencies
- `pnpm dev` — run local apps/services
- `pnpm build` — build all apps/packages
- `pnpm test:quick` — baseline local checks
- `pnpm test:full` — quick checks + integration + e2e

## Local Postgres (for integration)

- `pnpm db:postgres:up` — start local Postgres, apply migrations, seed data
- `pnpm db:postgres:down` — stop local Postgres

## Working style

- Keep changes small and reversible.
- Use feature branches and PRs for merge.
