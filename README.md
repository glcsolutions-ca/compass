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

## Main commands

- `pnpm dev` - run local apps/services
- `pnpm test` - run commit-stage checks (static + unit/component + contract)
- `pnpm test:full` - run commit-stage + integration tests
- `pnpm test:integration` - run integration tests only
- `pnpm test:e2e` - run Playwright smoke flow only
- `pnpm check` - alias of `pnpm test` (kept for compatibility)
- `pnpm build` - build all apps/packages
- `pnpm db:postgres:up` - start local Postgres, apply migrations, seed data
- `pnpm db:postgres:down` - stop local Postgres

## PR flow

1. Implement the change.
2. Run `pnpm test` and `pnpm build`.
3. Open a PR to `main`.
4. Let CI enforce merge safety (`commit-stage`).

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
- Mainline pipeline workflow: `.github/workflows/deployment-pipeline.yml`
- Runbooks: `docs/runbooks/`
