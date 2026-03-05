# AGENTS.md

## Repo map

```text
compass/
├─ .github/workflows
├─ apps/{api,web,worker}
├─ db/{migrations,postgres,scripts,seeds}
├─ infra/{azure,identity}
├─ packages/{contracts,sdk,testkit}
├─ pipeline/{contracts,shared,stages,runbooks}
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
│  │  │  ├─ production-rehearsal-evidence.schema.json
│  │  │  └─ release-evidence.schema.json
│  │  └─ fixtures/
│  ├─ shared/
│  │  └─ scripts/
│  │     ├─ cli-utils.mjs
│  │     ├─ schema-validator.mjs
│  │     ├─ pipeline-contract-lib.mjs
│  │     ├─ validate-release-candidate.mjs
│  │     ├─ fetch-release-candidate.mjs
│  │     ├─ deploy-from-manifest.mjs
│  │     └─ verify-from-manifest.mjs
│  ├─ stages/
│  │  ├─ 01-commit/
│  │  │  ├─ policies/
│  │  │  │  └─ commit-analysis.config.json
│  │  │  ├─ scripts/
│  │  │  │  ├─ generate-release-candidate.mjs
│  │  │  │  ├─ enforce-commit-stage-slo.mjs
│  │  │  │  └─ generate-commit-analysis-report.mjs
│  │  │  ├─ tests/
│  │  │  │  ├─ generate-release-candidate.test.mjs
│  │  │  │  ├─ enforce-commit-stage-slo.test.mjs
│  │  │  │  └─ generate-commit-analysis-report.test.mjs
│  │  │  └─ runbook.md
│  │  ├─ 02-acceptance/
│  │  │  ├─ scripts/
│  │  │  │  └─ record-acceptance-evidence.mjs
│  │  │  ├─ tests/
│  │  │  │  ├─ record-acceptance-evidence.test.mjs
│  │  │  │  └─ deploy-verify-from-manifest.test.mjs
│  │  │  └─ runbook.md
│  │  ├─ 04-production-rehearsal/
│  │  │  ├─ README.md
│  │  │  └─ runbook.md
│  │  ├─ 05-release/
│  │  │  ├─ scripts/
│  │  │  │  ├─ verify-acceptance-evidence.mjs
│  │  │  │  └─ record-release-evidence.mjs
│  │  │  ├─ tests/
│  │  │  │  └─ verify-acceptance-evidence.test.mjs
│  │  │  └─ runbook.md
│  │  └─ shared-tests/
│  │     ├─ validate-release-candidate.test.mjs
│  │     ├─ fetch-release-candidate.test.mjs
│  │     └─ schema-parity.test.mjs
│  └─ runbooks/
│     └─ repo-structure-migration.md
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
- `pnpm dev` — run full local stack in foreground (Ctrl+C tears down apps + deps)
- `pnpm dev:up` — start full local stack in background, wait for health checks, return when ready
- `pnpm dev:down` — manual recovery stop for local dev dependencies
- `pnpm build` — build all apps/packages
- `pnpm check` — baseline local quality gate
- `pnpm test:full` — check + integration + e2e

## Local Postgres (for integration)

- `pnpm --filter @compass/db-tools run postgres:up` — start local Postgres, apply migrations, seed data (ephemeral by default)
- `pnpm --filter @compass/db-tools run postgres:down` — stop local Postgres

## Working style

- Keep changes small and reversible.
- Use feature branches and PRs for merge.
