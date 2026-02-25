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

Agents can run these locally when needed.

- `pnpm install` — install workspace dependencies
- `pnpm dev` — run local apps/services
- `pnpm build` — build all apps/packages

### Testing

- `pnpm test` — **commit-stage** checks (static + unit/component + contract)
- `pnpm test:static` — policy + formatting + lint + typecheck (fastest local gate)
- `pnpm test:full` — commit-stage + integration tests
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

## Trunk-based CD (Dave Farley style)

- **Trunk = `main`**. `main` must stay **green and releasable** at all times.
- **Integrate in small batches**. Prefer **small, reversible** changes and frequent evidence-driven commits.
- **Pipeline = release evidence**. A change is “done” only when the `main` pipeline is green. If `main` goes red: **fix forward or revert immediately**.

### Agent workflow (direct-to-main)

```sh
# Worktrees: run these commands from the worktree where `main` is checked out.
# Confirm: git branch --show-current  # should print: main

git pull --rebase

# While iterating:
# pnpm test:static
# Before pushing to main:
pnpm test

git add -A
git commit -m "<small change>"
git push origin main

# If push is rejected (main moved):
#   git pull --rebase
#   <resolve conflicts>
#   pnpm test
#   git push origin main

# If the main pipeline is red:
#   fix forward, or:
#   git revert <bad_sha>
#   git push origin main
```
