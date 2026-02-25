## **AGENTS.md**

## How to navigate this repo

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
- `pnpm test` — run format, lint, typecheck, tests, and policy checks
- `pnpm build` — build all apps/packages
- `pnpm db:postgres:up` — start local Postgres, migrate, and seed
- `pnpm db:postgres:down` — stop local Postgres

## Trunk-based CD (Dave Farley style)

- **Trunk = `main`**. `main` must stay **green and releasable** at all times.
- **No long-lived branches / PR gates**. Prefer **small, reversible** changes and integrate frequently.
- **Pipeline = release evidence**. A change is “done” only when the `main` pipeline is green. If `main` goes red: **fix forward or revert immediately**.
- **High-risk pairing evidence**. For `infra`, `identity`, or `migration` pushes to `main`, commit messages must include `Paired-With: @github-handle`.

### Agent workflow (always)

```sh
# Worktrees: run these commands from the worktree where `main` is checked out.
# Confirm: git branch --show-current  # should print: main

git pull --rebase
pnpm test:static

git add -A
git commit -m "<small change>"
git push origin main

# If push is rejected (main moved):
#   git pull --rebase
#   <resolve conflicts>
#   pnpm test:static
#   git push origin main

# If the main pipeline is red:
#   fix forward, or:
#   git revert <bad_sha>
#   git push origin main
```
