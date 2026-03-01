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

- `pnpm test:quick` — **commit-stage** checks (policy + formatting + lint + typecheck + unit/component + contract)
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

## Direct to `main`

`main` is trunk. Keep it green and releasable. Work in tiny, reversible steps. Commit and push each step directly to `origin/main`. A change is not done until the GitHub Actions runs for its SHA pass. If any run fails, fix forward or revert immediately.

```sh
set -euo pipefail

test "$(git branch --show-current)" = "main"
gh auth status >/dev/null
git pull --rebase origin main

wait_main() {
  sha="$(git rev-parse HEAD)"
  until [ "$(gh run list --commit "$sha" --event push --json databaseId --jq 'length')" -gt 0 ]; do sleep 3; done
  while :; do
    run_ids="$(gh run list --commit "$sha" --event push --json databaseId,status --jq '.[] | select(.status != "completed") | .databaseId')"
    if [ -z "$run_ids" ]; then
      sleep 3
      run_ids="$(gh run list --commit "$sha" --event push --json databaseId,status --jq '.[] | select(.status != "completed") | .databaseId')"
      [ -z "$run_ids" ] && break
    fi
    for run_id in $run_ids; do
      gh run watch "$run_id" --compact --exit-status
    done
  done
  test "$(gh run list --commit "$sha" --event push --json conclusion --jq 'map(select(.conclusion != "success")) | length')" -eq 0
}

# Repeat for each tiny, reversible step. Commit and push each step. No batching. No --no-verify.
git add -A
git commit -m "<small, specific change>"   # pre-commit runs lint-staged + pnpm test:quick
git push origin HEAD:main                  # pre-push runs pnpm test:full
wait_main

# If origin/main moved: rebase, resolve conflicts if needed, push, then wait_main again.
git pull --rebase origin main
git push origin HEAD:main
wait_main

# If any run fails: fix forward with another tiny commit and wait_main, or revert immediately.
git revert <bad_sha>
git push origin HEAD:main
wait_main
```
