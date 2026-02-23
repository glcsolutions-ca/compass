# Contributing

Keep changes small, testable, and easy to review. `main` stays releasable through PRs and CI gates.

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

Before opening a PR:

```bash
pnpm check
pnpm build
```

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

- CI is the merge source of truth; `risk-policy-gate` is required.
- Keep one intent per PR and avoid unrelated file changes.
- For behavior changes, update docs in `docs/` and/or policy checks.
- Treat `migrations/`, `infra/`, `auth`, and deploy workflows as high risk: keep rollout and rollback explicit.

## References

- Contributor map: `README.md`
- Agent and repo conventions: `AGENTS.md`
- Testing philosophy: `docs/testing.md`
- Human merge policy: `docs/merge-policy.md`
- Machine merge policy: `.github/policy/merge-policy.json`
- Merge workflow: `.github/workflows/merge-contract.yml`
- Deploy workflow: `.github/workflows/deploy.yml`
- Infra and identity workflows: `.github/workflows/infra-apply.yml`, `.github/workflows/identity-plan.yml`, `.github/workflows/identity-apply.yml`
