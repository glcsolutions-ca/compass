# Compass by GLC

One place to see work, time, and delivery across your company.

Compass gives clients, teams, and project managers a real-time snapshot of assignments,
workload, time investment, and project health.

## Product Family

- `Compass Hub`: central workspace and consolidated operational view.
- `Compass Timesheets`: time capture and time investment visibility.
- `Compass Chat`: AI chat interface for asking questions, retrieving information, and creating
  time entries.
- `Compass Client Portal`: client-facing status and delivery visibility.

## Quick Start

Requirements:

- Node.js 24.13.1

```bash
pnpm install
pnpm dev
```

## Root Doorway

- `README.md`: project and engineering baseline.
- `AGENTS.md`: agent entrypoint and navigation to agent playbooks.
- `CONTRIBUTING.md`: agent-focused contribution and merge-contract workflow.

## Toolchain Baseline

- One-time baseline update: Node `24.13.1` and `pnpm@10.30.1`.
- No recurring dependency automation is configured yet.

## Baseline Standards (Normative)

### Package Manager and Workspace

- Use `pnpm` with workspace roots defined in `pnpm-workspace.yaml`.
- Use Node `24.13.1` (`.nvmrc`).

### Module Organization

- Use feature-first organization in app backends under `src/features`.
- Keep app composition in `src/index.ts` and `src/app.ts`.
- Use barrel exports only at package root and feature root boundaries.

### Naming

- Use `kebab-case` for filenames.
- In feature folders, prefer scoped short names (for example `route.ts`, `repository.ts`, `service.ts`).
- Use `PascalCase` for interfaces, types, classes, and enums.
- Use `camelCase` for functions, methods, variables, and properties.

### TypeScript Projects

- Use solution-style references from root `tsconfig.json`.
- Keep package/app TypeScript config local to each workspace and add reference edges for cross-workspace dependencies.
- Use `tsconfig.ref.json` in each workspace for reference-graph builds and declaration-only output to `dist-types`.
- Use `tsconfig.build.json` in each workspace for runtime JavaScript output to `dist` (and exclude `*.test.ts` where applicable).

### Test Placement

- Co-locate tests with source files using `*.test.ts`.

### Import Boundaries

- Do not use app-local alias imports like `@/`.
- Use relative imports inside a package.
- In NodeNext workspaces, include `.js` file extensions on relative imports (for example `./repository.js`).
- Use package-root imports across package boundaries (for example `@compass/contracts`).
- Do not deep-import `@compass/*/src/*` or `@compass/*/dist/*`.

### Generated Artifacts

- Keep `packages/contracts/openapi/openapi.json` committed.
- Keep `packages/sdk/src/generated/schema.ts` committed.

### Environment Configuration

- Keep checked-in env templates at:
  - `apps/api/.env.example`
  - `apps/worker/.env.example`
  - `apps/web/.env.local.example`
- API and worker auto-load local `.env` files at runtime via `dotenv`.
- Next.js web uses standard `.env.local` behavior.

## Required Commands

- Start all apps in development:

```bash
pnpm dev
```

- Validate the full baseline gate (required before PR):

```bash
pnpm check
```

- PR CI uses a deterministic merge-contract workflow:
  - `preflight` computes tier + required checks from `.github/policy/merge-policy.json`.
  - `docs-drift` blocks control-plane/docs-critical changes without docs updates.
  - `codex-review` runs no-op or full mode based on `reviewPolicy.codexReviewEnabled`.
  - with review enabled, `t3` runs full blocking review; lower tiers remain no-op artifacts.
  - `ci-pipeline` runs `pnpm check` and `pnpm build`.
  - `browser-evidence` and `harness-smoke` run only when policy requires them.
  - `risk-policy-gate` is the final fail-closed gate and only required branch-protection check.

- Validate workspace TypeScript references:

```bash
pnpm typecheck:refs
```

- Regenerate and verify contract artifacts:

```bash
pnpm contract:generate
pnpm contract:check
```

- Merge-contract commands:

```bash
pnpm ci:preflight
pnpm ci:docs-drift
pnpm ci:codex-review
pnpm ci:pipeline
pnpm ci:browser-evidence
pnpm ci:harness-smoke
pnpm ci:gate
pnpm test:merge-contract
```

## Command Matrix

| Command                    | Contract                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                 | Starts all workspace dev processes through Turbo in parallel.                                                                                          |
| `pnpm build`               | Runs each workspace runtime build (`dist` for TypeScript packages/apps, `.next` for web).                                                              |
| `pnpm test`                | Runs workspace tests from source through Turbo without requiring upstream builds first.                                                                |
| `pnpm typecheck`           | Runs workspace-level `tsc --noEmit` checks through Turbo.                                                                                              |
| `pnpm typecheck:refs`      | Runs root solution references with `tsc -b --pretty false` using `tsconfig.ref.json` targets and declaration-only outputs.                             |
| `pnpm check`               | Runs formatting, linting, type checks, reference checks, tests, and contract checks as the pre-PR gate.                                                |
| `pnpm check:format`        | Runs Prettier in check mode for the full repository.                                                                                                   |
| `pnpm check:lint`          | Runs workspace lint tasks through Turbo.                                                                                                               |
| `pnpm check:typecheck`     | Runs workspace type checks and root TypeScript reference checks.                                                                                       |
| `pnpm check:test`          | Runs workspace tests through Turbo.                                                                                                                    |
| `pnpm check:contract`      | Runs contract generation and fails if committed generated artifacts drift.                                                                             |
| `GitHub PR`                | Runs deterministic merge contract: `preflight` -> `docs-drift` -> `codex-review` -> `ci-pipeline` -> conditional evidence/smoke -> `risk-policy-gate`. |
| `pnpm contract:generate`   | Regenerates OpenAPI and SDK artifacts.                                                                                                                 |
| `pnpm contract:check`      | Regenerates contracts and verifies committed artifacts are unchanged.                                                                                  |
| `pnpm ci:preflight`        | Computes changed files, tier, and required checks from `.github/policy/merge-policy.json`.                                                             |
| `pnpm ci:docs-drift`       | Enforces blocking docs-drift rules for control-plane and docs-critical paths.                                                                          |
| `pnpm ci:codex-review`     | Runs no-op or full review based on policy; full mode is enforced only when `reviewPolicy.codexReviewEnabled=true`.                                     |
| `pnpm ci:pipeline`         | Runs `pnpm check` and `pnpm build`.                                                                                                                    |
| `pnpm ci:browser-evidence` | Runs Playwright smoke and writes browser evidence manifest under `.artifacts/browser-evidence/<headSha>/`.                                             |
| `pnpm ci:harness-smoke`    | Runs targeted harness smoke checks and writes `.artifacts/harness-smoke/<headSha>/result.json`.                                                        |
| `pnpm ci:gate`             | Enforces required-evidence validity for current head SHA and tier, then fails closed on violations.                                                    |
| `pnpm test:merge-contract` | Runs merge-contract utility tests.                                                                                                                     |

## Service Endpoints

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- OpenAPI: `http://localhost:3001/openapi.json`
- Health: `http://localhost:3001/health`

## Project Structure

```text
.github/workflows/
  merge-contract.yml

.github/policy/
  merge-policy.json

apps/
  api/
  web/
  worker/

scripts/
  ci/

tests/
  e2e/
  harness/

docs/
  merge-policy.md
  branch-protection.md

packages/
  contracts/
  sdk/
```

## Documentation

- Brand architecture: `docs/brand-architecture.md`
- Stack decision record: `docs/TDR-001-initial-stack-baseline.md`
- Merge policy single pager: `docs/merge-policy.md`
- Branch protection setup: `docs/branch-protection.md`
- Agent knowledge store: `docs/agents/README.md`

## Contributing

- Contributor guide: `CONTRIBUTING.md`
- Agent guide index: `AGENTS.md`
