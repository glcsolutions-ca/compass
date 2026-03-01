# AGENTS.md

Purpose: default working contract for coding agents in this repository.

## Repo Map

```text
compass/
├─ .github/{policy,workflows}
├─ apps/{api,web,worker,desktop,codex-session-runtime}
├─ db/{migrations,postgres,scripts,seeds}
├─ docs/{runbooks,contracts,architecture,adr,agents}
├─ infra/{azure,identity}
├─ packages/{contracts,sdk,codex-protocol,testkit}
├─ scripts/pipeline/**
└─ tests/{e2e,system,policy}
```

## Core Commands

- `pnpm install`
- `pnpm dev`
- `pnpm build`
- `pnpm test:quick`
- `pnpm test:full`

Integration prerequisites:

```bash
pnpm db:postgres:up
pnpm test:integration
pnpm db:postgres:down
```

## Trunk-Based CD Rules

- `main` is trunk and must stay releasable.
- Integrate in small, reversible batches.
- Required quality gates are `commit-stage` and `integration-gate`.
- If `main` goes red, fix forward or revert immediately.

## Direct-To-Main Loop

```bash
git pull --rebase
pnpm test:quick
pnpm test:full
git add -A
git commit -m "<small change>"
git push origin main
```

If push is rejected, rebase and rerun `pnpm test:full` before pushing again.
