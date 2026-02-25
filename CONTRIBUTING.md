# Contributing

Keep changes small, testable, and reversible. `main` stays releasable through push-time stage gates.

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

Local hooks are enabled automatically during `pnpm install` and run commit-test suite locally:

- Hook install prefers worktree-local Git config (`git config --worktree`) so worktrees do not overwrite each other.
- `.githooks/pre-commit` runs `pnpm git-hooks:pre-commit` (`pnpm exec lint-staged`) on staged files.
- `.githooks/pre-push` runs `pnpm test:static` via `pnpm git-hooks:pre-push` as a quick local pre-push gate.

Full quality and integration correctness are enforced in CI:

- `commit-stage` (`.github/workflows/commit-stage.yml`)
- `integration-gate` (`.github/workflows/integration-gate.yml`)

Before pushing:

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
- `pnpm test:static` - policy + format + lint + typecheck checks

Useful DB commands:

- `pnpm db:postgres:down` - stop local Postgres
- `pnpm db:postgres:reset` - rebuild local Postgres from migrations + seed
- `pnpm db:migrate:create -- <name>` - create a migration
- `pnpm db:migrate:status` - show migration status

`pnpm db:postgres:up` starts Docker PostgreSQL, waits for readiness, applies migrations from `migrations/`, and seeds local data.
The API uses PostgreSQL when `DATABASE_URL` is set in `apps/api/.env` (see `apps/api/.env.example`).

## Trunk-first push standard

- Push small commits directly to `main` after local validation.
- Optional PRs are allowed for preview/collaboration; they are non-gating.
- For changes touching `infra`, `identity`, or `migration`, include commit trailer:

```text
Paired-With: @github-handle
```

## Quality and safety checks

- CI is the integration source of truth; `commit-stage` and `integration-gate` are required on `main`.
- Keep one intent per commit and avoid unrelated file changes.
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
- Cloud deployment pipeline workflow: `.github/workflows/cloud-deployment-pipeline.yml`
- Cloud deployment pipeline replay workflow: `.github/workflows/cloud-deployment-pipeline-replay.yml`
- Desktop deployment pipeline workflow: `.github/workflows/desktop-deployment-pipeline.yml`
