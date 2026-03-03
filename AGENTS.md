# AGENTS.md

## Repo map

```text
compass/
├─ apps/{api,web,worker}
├─ db/{migrations,postgres,scripts,seeds}
├─ infra/{azure,identity}
├─ packages/{contracts,sdk}
├─ scripts/{dev,infra}
└─ tests/{e2e,system}
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
