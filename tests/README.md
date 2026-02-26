# Testing Philosophy

Tests in this repo are **release evidence**: fast, deterministic signals that keep `main` **releasable** and enable **small-batch** delivery.

Rule of thumb: use the **cheapest test** that provides enough confidence.

---

## Core rules

- **Evidence over debate**: changes must produce machine-verifiable evidence (tests + artifacts).
- **Fast gate first**: the default suite must be fast and run constantly.
- **Deterministic or broken**: flakes are bugs. No sleeps. No timing lotteries.
- **Test what we ship**: validate the integrated result (what lands on `main`), not just a local/branch head.
- **Build once, promote**: prefer immutable artifacts (e.g., image digests) promoted through environments.

---

## Test pyramid (preferred mix)

1. **Static checks** (always)  
   Format / lint / typecheck / policy / schema validation

2. **Unit + component tests** (many)  
   Hermetic, in-process. No network. No real DB.

3. **Contract tests** (important)  
   Lock API ↔ Web ↔ SDK expectations. Prefer contracts over UI tests.

4. **Integration tests** (some)  
   Real Postgres + migrations + critical queries/invariants. Keep small.

5. **E2E UI tests** (few)  
   Golden paths only. Must be stable.

6. **Post-deployment verification gate** (minimal)  
   “Is it alive?” checks (health + one critical authenticated path + optional page load).

---

## What runs when (CI policy)

### Fast gate (runs frequently; should be minutes)

- Static checks
- Unit/component
- Contract tests

### Deeper validation (risk-based)

- Integration tests (real DB)
- E2E UI (only when needed)

### `main` / release candidate

- Promote the immutable artifact
- Minimal smoke verification (avoid re-running everything)

---

## Non‑negotiables

- **No `sleep()`**: poll for readiness conditions.
- **Control time**: inject clocks / fake timers / fixed time.
- **Seed randomness**: reproducible runs only.
- **Quarantine policy**: flaky tests must have an owner + reason + expiry date (no indefinite quarantine).

---

## Standard commands (CI and humans use the same entrypoints)

- `pnpm test:quick`  
  Fast gate (canonical)

- `pnpm test`  
  Alias for `pnpm test:quick`

- `pnpm test:full`  
  Fast gate + integration (+ optional E2E if required)

- `pnpm test:unit` / `pnpm test:integration` / `pnpm test:e2e`  
  Targeted runs

### Output behavior (quick/unit)

- Green runs are intentionally compact.
- Red runs print failed-task logs and failing test diagnostics.
- Pre-commit auto-fixes staged files with `pnpm exec lint-staged` before running `pnpm test:quick`.
- `pnpm test:quick` remains fail-closed and repo-wide; formatting failures emit `FMT001` with fix commands.

For deep diagnostics, rerun:

```bash
pnpm turbo run test --output-logs=full --ui=stream --log-order=grouped
pnpm test:pipeline-contract -- --reporter=default
```

---

## Conventions (adjust paths to match the repo)

- Unit/component: colocated with code (`apps/**/src/**`, `packages/**/src/**`)
- Contracts: `packages/contracts/**`
- Integration: `**/test/integration/**`
- E2E (Playwright): `tests/e2e/**`
- System/smoke: `tests/system/**` and/or `tests/smoke/**`
- Shared testkit: `packages/testkit/**`
