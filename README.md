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

- Web (`apps/web`): React Router 7 framework mode (`ssr: false`), containerized as static non-root nginx on port `3000`
- API (`apps/api`): Express 5 + contract-backed OpenAPI on `API_PORT`
- Worker (`apps/worker`): Azure Service Bus consumer (`loop` or `once`)
- Dynamic Sessions runtime (`apps/codex-session-runtime`): minimal container runtime for session pools

## Main commands

- `pnpm dev` - run local core services (API, web)
- `pnpm dev:all` - run all services including worker
- `pnpm dev:worker` - run worker only (cloud credentials required)
- `pnpm test:quick` - run the quick local gate (static + unit/component + contract)
- `pnpm test` - alias for `pnpm test:quick`
- `pnpm test:unit` - run workspace unit/component + pipeline contract tests
- `pnpm test:full` - run backend preflight first, then quick gate + integration + Playwright smoke
- `pnpm test:integration` - run integration tests only
- `pnpm test:e2e` - run Playwright smoke flow only
- `pnpm build` - build all apps/packages
- `pnpm db:postgres:up` - start local Postgres, apply migrations, seed data
- `pnpm db:postgres:down` - stop local Postgres

## Console Contract Steering (CCS)

Primary directive:

**Run guardrails; if they fail, do exactly what the console says until green.**

- Contract: `docs/ccs.md`
- Guardrail inventory: `.github/policy/ccs-guardrails.json`

## Local Env Bootstrap

- `pnpm dev` and `pnpm db:postgres:*` call `scripts/dev/ensure-local-env.mjs` before service startup.
- `pnpm dev` starts local-core services only. Use `pnpm dev:all` to include worker, or `pnpm dev:worker` to run worker explicitly.
- Bootstrap manages `apps/api/.env`, `apps/web/.env`, and `db/postgres/.env`, and only appends missing required keys when a file already exists.
- Worker env is intentionally not auto-managed by this script.
- Value precedence is: explicit shell env var > existing `.env` value > generated worktree default.
- Generated defaults include per-worktree ports (`WEB_PORT`, `API_PORT`, `POSTGRES_PORT`), `VITE_API_BASE_URL`, `DATABASE_URL`, and `COMPOSE_PROJECT_NAME`.

## Trunk-first flow

1. Implement the change in small, reversible commits.
2. Run `pnpm test:quick` while iterating.
3. Before push, run `pnpm test:full`.
4. Run `pnpm build` when changes affect runtime/build outputs.
5. Commit and push to `main`.
6. If high-risk policy blocks direct `main` integration, use a short-lived branch and open a PR.
7. If any guardrail fails, follow the printed `WHY/FIX/DO/REF` steps exactly.

## Test output behavior

- `pnpm test:quick` and `pnpm test:unit` run with low-noise logging by default.
- Green runs: compact summaries (`Tasks`, `Cached`, `Time`, Vitest totals).
- Red runs: failed tasks print their logs and failing test diagnostics.
- Formatting failures print `FMT001` with explicit fix commands.

For deep diagnostics, rerun:

```bash
pnpm turbo run test --output-logs=full --ui=stream --log-order=grouped
pnpm test:pipeline-contract -- --reporter=default
```

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
