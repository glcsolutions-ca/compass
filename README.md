# Compass

One place to see work, time, and delivery across your company.

This README is a launch point. Detailed policy, runbooks, and architecture records live in `docs/`.

## Quick start

Requirements:

- Node.js `22.x` (from `.nvmrc`, enforced by `engines`)
- `pnpm` `10.30.1`
- Docker (only for local Postgres)

```bash
pnpm install
pnpm db:postgres:up   # optional for API/data work
pnpm dev
```

Optional cloud worker (requires Service Bus/Azure credentials):

```bash
pnpm dev:worker
```

`pnpm db:postgres:*` and `pnpm dev` now run local `.env` bootstrap for each worktree when needed.

## Runtime snapshot

- Web (`apps/web`): React Router 7 framework mode (`ssr: false`) on `WEB_PORT`
- API (`apps/api`): Express 5 + contract-backed OpenAPI on `API_PORT`
- Worker (`apps/worker`): Azure Service Bus consumer (`loop` or `once`)
- Codex gateway (`apps/codex-app-server`): thread/turn + stream APIs on `CODEX_PORT`

## Main commands

- `pnpm dev` - run local core services (API, web, codex gateway)
- `pnpm dev:all` - run all services including worker
- `pnpm dev:worker` - run worker only (cloud credentials required)
- `pnpm test` - run commit-stage checks (static + unit/component + contract)
- `pnpm test:unit` - run workspace unit/component + pipeline contract tests
- `pnpm test:full` - run commit-stage + integration tests
- `pnpm test:integration` - run integration tests only
- `pnpm test:e2e` - run Playwright smoke flow only
- `pnpm test:static` - run policy + formatting + lint + typecheck checks
- `pnpm build` - build all apps/packages
- `pnpm db:postgres:up` - start local Postgres, apply migrations, seed data
- `pnpm db:postgres:down` - stop local Postgres

## Local Env Bootstrap

- `pnpm dev` and `pnpm db:postgres:*` call `scripts/dev/ensure-local-env.mjs` before service startup.
- `pnpm dev` starts local-core services only. Use `pnpm dev:all` to include worker, or `pnpm dev:worker` to run worker explicitly.
- Bootstrap manages `apps/api/.env`, `apps/web/.env`, `apps/codex-app-server/.env`, and `db/postgres/.env`, and only appends missing required keys when a file already exists.
- Worker env is intentionally not auto-managed by this script.
- Value precedence is: explicit shell env var > existing `.env` value > generated worktree default.
- Generated defaults include per-worktree ports (`WEB_PORT`, `API_PORT`, `CODEX_PORT`, `POSTGRES_PORT`), `VITE_API_BASE_URL`, `DATABASE_URL`, and `COMPOSE_PROJECT_NAME`.

## Trunk-first flow

1. Implement the change in small, reversible commits.
2. Run `pnpm test` and `pnpm build`.
3. Commit and push to `main`.
4. If high-risk policy blocks direct `main` integration, use a short-lived branch and open a PR.

## PR title and format standard

- Title: `<type>(<scope>): <summary>`
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `ci`, `chore`
- Rules: lowercase, imperative summary, max 72 characters, no trailing period
- Description sections: `## Summary`, `## Testing`, `## Risk`

## Navigate

- Contributor workflow: `CONTRIBUTING.md`
- Agent guide: `AGENTS.md`
- Docs index: `docs/README.md`
- App index: `apps/README.md`
- Package index: `packages/README.md`
- Script index: `scripts/README.md`
- Testing philosophy: `tests/README.md`
- Testing policy and enforcement (layers 1-3): `tests/policy/README.md`
- Commit-stage policy (human): `docs/commit-stage-policy.md`
- Branch protection: `docs/branch-protection.md`
- Machine policy: `.github/policy/pipeline-policy.json`
- Commit stage workflow: `.github/workflows/commit-stage.yml`
- Integration gate workflow: `.github/workflows/integration-gate.yml`
- Cloud deployment pipeline workflow: `.github/workflows/cloud-deployment-pipeline.yml`
- Cloud deployment pipeline replay workflow: `.github/workflows/cloud-deployment-pipeline-replay.yml`
- Desktop deployment pipeline workflow: `.github/workflows/desktop-deployment-pipeline.yml`
- Runbooks: `docs/runbooks/`
