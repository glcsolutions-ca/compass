# Contributing

Keep changes small, testable, and easy to review. `main` stays releasable through PRs and stage gates.

## Prerequisites

- Node.js `22.x` (from `.nvmrc`, enforced by `engines`)
- `pnpm` `10.30.1` (from `packageManager`)
- Docker (only for local Postgres)

## Local workflow

```bash
pnpm install
pnpm db:postgres:up   # optional for API/data work
pnpm dev
```

Local hooks are enabled automatically during `pnpm install` and run fast feedback locally:

- Hook install prefers worktree-local Git config (`git config --worktree`) so worktrees do not overwrite each other.
- `.githooks/pre-commit` runs `pnpm git-hooks:pre-commit` (`pnpm exec lint-staged`) on staged files.
- `.githooks/pre-push` runs `pnpm test:static` via `pnpm git-hooks:pre-push` as a quick local pre-push gate.

Full quality and merge correctness are enforced in CI:

- `commit-stage` (`.github/workflows/commit-stage.yml`)
- `merge-queue-gate` (`.github/workflows/merge-queue-gate.yml`)

Before opening a PR:

```bash
pnpm test
pnpm build
```

Testing commands:

- `pnpm test` - commit-stage checks (static + unit/component + contract)
- `pnpm test:full` - commit-stage + integration tests
- `pnpm test:unit` - workspace unit/component tests + pipeline contract tests
- `pnpm test:integration` - integration tests only
- `pnpm test:e2e` - Playwright smoke flow only
- `pnpm check` - alias to `pnpm test` (transitional)

Useful DB commands:

- `pnpm db:postgres:down` - stop local Postgres
- `pnpm db:postgres:reset` - rebuild local Postgres from migrations + seed
- `pnpm db:migrate:create -- <name>` - create a migration
- `pnpm db:migrate:status` - show migration status

`pnpm db:postgres:up` starts Docker PostgreSQL, waits for readiness, applies migrations from `migrations/`, and seeds local data.
The API uses PostgreSQL when `DATABASE_URL` is set in `apps/api/.env` (see `apps/api/.env.example`).

## Pull request standard

- No direct pushes to `main`.
- Title: `<type>(<scope>): <summary>`
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `ci`, `chore`
- Rules: lowercase, imperative, max 72 chars, no trailing period
- Description sections: `## Summary`, `## Testing`, `## Risk`

## Quality and safety checks

- CI is the merge source of truth; `commit-stage` is required.
- Keep one intent per PR and avoid unrelated file changes.
- For behavior changes, update docs in `docs/` and/or policy checks.
- Treat `migrations/`, `infra/`, `auth`, and pipeline workflows as high risk: keep rollout and rollback explicit.

## References

- Contributor map: `README.md`
- Agent and repo conventions: `AGENTS.md`
- Testing philosophy: `tests/README.md`
- Testing policy and enforcement (layers 1-3): `tests/policy/README.md`
- Human commit-stage policy: `docs/commit-stage-policy.md`
- Machine pipeline policy: `.github/policy/pipeline-policy.json`
- Commit stage workflow: `.github/workflows/commit-stage.yml`
- Cloud delivery pipeline workflow: `.github/workflows/cloud-delivery-pipeline.yml`
- Cloud delivery replay workflow: `.github/workflows/cloud-delivery-replay.yml`
- Desktop deployment pipeline workflow: `.github/workflows/desktop-deployment-pipeline.yml`
