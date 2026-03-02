# AGENTS.md

## Repo map

```text
compass/
├─ .github/{policy,workflows}
├─ apps/{api,web,worker}
├─ db/{migrations,postgres,scripts,seeds}
├─ docs/{agents,runbooks,architecture,adr}
├─ infra/{azure,identity}
├─ packages/{contracts,sdk}
├─ scripts/{ci,deploy}
└─ tests/{e2e,system}
```

## Main commands

- `pnpm install` — install workspace dependencies
- `pnpm dev` — run local apps/services
- `pnpm build` — build all apps/packages

### Testing

- `pnpm test:quick` — **commit-stage** checks (policy + doc quality + formatting + lint + typecheck + unit/component + contract)
- `pnpm test` — alias for `pnpm test:quick`
- `pnpm test:full` — quick gate + integration tests + Playwright smoke
- `pnpm test:integration` — integration tests only (requires local Postgres)
- `pnpm test:e2e` — Playwright smoke flow only

### Local Postgres (for integration)

- `pnpm db:postgres:up` — start local Postgres, apply migrations, seed data
- `pnpm db:postgres:down` — stop local Postgres

Example (integration run):

```sh
pnpm db:postgres:up
pnpm test:integration
pnpm db:postgres:down
```

## Trunk Via PR + Merge Queue

`main` is trunk. Keep it green and releasable. Work in tiny, reversible steps. Merge through PR + merge queue only. A change is not done until required merge-queue checks pass and the PR is merged. Do not rely on post-merge auto-revert.

```sh
set -euo pipefail

gh auth status >/dev/null
git pull --rebase origin main
test "$(git branch --show-current)" != "main"

# Repeat for each tiny, reversible step. No batching. No --no-verify.
git add -A
git commit -m "<small, specific change>"   # pre-commit runs lint-staged + pnpm check:commit-fast
git push -u origin HEAD                    # pre-push runs pnpm test:quick

gh pr create --fill
gh pr merge --auto --merge                 # enters merge queue when branch protection requires it

# Observe required checks for deterministic feedback:
# - commit-stage
# - integration-gate
# - staging-gate
gh pr checks --watch

# If checks fail: fix forward on the same PR branch and push again.
```

Default local loop before push is `pnpm test:quick`.
Run deeper suites when risk requires it:

- `pnpm test:integration` for DB/API changes (with local Postgres up)
- `pnpm test:e2e` or `pnpm test:full` for higher-risk UI/integration changes
