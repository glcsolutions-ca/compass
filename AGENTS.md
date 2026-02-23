## How to navigate this repo

```text
compass/
- .github/{policy,workflows}
- apps/{api,web,worker}
- db/postgres
- docs/{agents,runbooks}
- infra/{azure,identity}
- migrations
- packages/{contracts,sdk}
- scripts/{ci,db,deploy}
- tests/{e2e,harness}
```

## Main commands

- `pnpm install` - install workspace dependencies
- `pnpm dev` - run local apps/services
- `pnpm check` - run format, lint, typecheck, tests, and policy checks
- `pnpm build` - build all apps/packages
- `pnpm db:postgres:up` - start local Postgres, migrate, and seed
- `pnpm db:postgres:down` - stop local Postgres

## Guiding principles (Farley + Code Factory + Harness)

### 1) Keep `main` always releasable

- No direct pushes to `main`. Merge via PR + required gate(s).
- Small batches. Fast feedback. Fix forward.

### 2) Make work provable

- Write tasks with **explicit success criteria**.
- Prefer **machine-verifiable evidence** over “looks good”: tests, artifacts, logs, screenshots, manifests.

### 3) Keep changes small enough to be reviewed and reverted

- One intent per PR.
- If the change is large, split it (scaffold → wire → migrate → clean up).

### 4) Build once, promote immutable artifacts

- Runtime deploys must promote the **same artifact** that passed CI.
- Prefer **digest refs** (`repo@sha256:...`) over mutable tags.

### 5) Pipelines should be wide, not long

- Parallelize checks when possible.
- Avoid duplicated “big CI gates” in multiple places; keep gates purposeful.

### 6) Separate unprivileged checks from production mutation

- Non-prod checks should not require prod secrets or prod access.
- Production mutation happens only in the designated release workflow / job.

### 7) Prefer constraints over prose

- If a rule matters, **automate enforcement** (lint/structural test/policy gate).
- Add docs for intent + rationale; add checks for enforcement.

### 8) Don’t guess

- If you’re unsure: search the repo, read the docs, inspect existing patterns.
- Choose the smallest change that increases clarity and reduces future drift.

### 9) Make the repo legible to agents and humans

- Put “why” and “how to verify” in the repo, not in chat threads.
- Keep docs current; stale docs are worse than missing docs.

### 10) Be safe by default

- Treat migrations, auth, infra, and control-plane as high risk.
- Prefer reversible steps, explicit rollout boundaries, and clear rollback paths.

---

## Default expectations for any PR

- Clear intent (title + description).
- Evidence: tests/CI green, and required artifacts when applicable.
- No production secrets used in untrusted PR execution paths.
- If behavior changes: update/add docs in `docs/` and/or add a check to prevent drift.
