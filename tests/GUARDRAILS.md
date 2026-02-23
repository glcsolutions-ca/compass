# Testing Enforcement

This repo enforces `tests/README.md` **automatically**. Authors (and AI agents) should only focus on writing tests.  
The repo provides early, actionable feedback when tests violate our testing philosophy.

The goal is simple: **fast, trustworthy evidence** that keeps `main` releasable.

---

## Design goals

1. **No special author steps**
   - No tags, annotations, or manual “test layer” selection.
   - Tests are classified by **where they live** and **how they’re named**.

2. **Fail fast**
   - Catch violations before heavy installs or long-running suites.

3. **Actionable errors**
   - Every failure explains:
     - what rule was violated
     - where it happened
     - why it matters (1 line)
     - exactly how to fix it
     - where to read more (`tests/README.md`)

4. **Farley-aligned pipeline**
   - Cheap checks first (commit-stage), deeper evidence only when risk requires it.
   - Pipeline stays **wide, not long**.

---

## Enforcement layers (3 layers)

### Layer 1 — Testing Contract (structure + hygiene, fastest)

**What it enforces**

- Test files must map to exactly one test layer by path
- `test.only` / `describe.only` are forbidden
- `test.skip` / `describe.skip` are allowed only via explicit quarantine
- E2E/Playwright tests must live only under `tests/e2e/`
- Integration tests must live only under `apps/**/test/integration/`

**When it runs**

- PR preflight, before dependency install (fastest possible failure)

**Output**

- Machine-readable artifact under `.artifacts/testing-contract/<testedSha>/result.json`

---

### Layer 2 — Runner Guardrails (runtime enforcement, automatic)

**What it enforces**
Commit-stage tests must be hermetic and deterministic.

- **Commit-stage (`pnpm test`)**
  - Network access: **loopback only** (`localhost`, `127.0.0.1`, `::1`)
  - Postgres access: **blocked**
  - Optional: block `child_process` (prevents hidden external tooling)

- **Integration (`pnpm test:integration`)**
  - Real Postgres allowed
  - External network still blocked by default (mock SaaS at the boundary)

**Why**

- Prevents “unit tests” that accidentally depend on DB/network and become flaky.
- Makes the test pyramid stable by default.

**Output**

- Failures explain the rule and provide concrete fixes.

---

### Layer 3 — Lint rules for test hygiene (fast + precise)

**What it enforces**

- No `*.only` in committed tests
- No raw sleeps (`setTimeout` / ad-hoc `sleep`) in tests (use `testkit/waitFor`)
- No unseeded randomness (`Math.random`) in tests
- No DB client imports in commit-stage test globs
- Other hygiene rules as needed

These run in the normal lint/check pipeline and produce immediate feedback.

---

## Test layers (what counts as what)

Tests are classified by **path**, not annotations.

Recommended conventions:

- **Commit-stage (unit/component/contract)**
  - `apps/**/src/**/*.test.ts(x)`
  - `packages/**/src/**/*.test.ts(x)`

- **Integration**
  - `apps/**/test/integration/**/*.test.ts`

- **E2E (Playwright)**
  - `tests/e2e/**/*.spec.ts`

- **Smoke/System**
  - `tests/smoke/**/*.ts` (or `tests/system/**` if used)

If a test is in the wrong location, the Testing Contract fails with a `git mv` fix suggestion.

---

## CI flow placement (Farley-style)

### PR: commit-stage first, then deeper evidence

1. **Preflight**
   - determine risk tier + required evidence

2. **Testing Contract (Layer 1)**
   - fail immediately on structural violations
   - no dependency install required

3. **CI pipeline**
   - lint (Layer 3)
   - `pnpm test` (Layer 2 guardrails)
   - if required: `pnpm test:integration`
   - if required: `pnpm test:e2e`

4. **Gate**
   - a thin merge decision based on required evidence

### `main` release candidate

- does not re-run the entire PR test portfolio
- focuses on promotion + smoke verification

---

## Quarantine policy (optional but recommended)

If a test must be temporarily skipped:

- it must be listed in `tests/quarantine.json` with:
  - test identifier
  - owner
  - reason
  - expiry date

Rules:

- `*.skip` is forbidden unless quarantined
- expired quarantine entries fail CI

This prevents “permanent skip rot.”

---

## Error message standard (what to expect)

Every enforcement failure should include:

- **Rule ID** (stable identifier, e.g., `TC020`, `NET001`)
- **Path** to the violating file
- **Why** it matters (one line)
- **Fix** steps (concrete commands)
- **Docs link** (`tests/README.md#...`)

Example:

```

✗ TC020 Integration tests must live under apps/**/test/integration/
Found: apps/api/src/userRepo.test.ts
Why: Commit-stage tests must be hermetic (no DB).
Fix:
mkdir -p apps/api/test/integration
git mv apps/api/src/userRepo.test.ts apps/api/test/integration/userRepo.test.ts
See: tests/README.md#integration-tests

```

---

## Where the enforcement lives

- Structure contract: `scripts/ci/testing-contract.mjs`
- Runner guardrails + test helpers: `packages/testkit/**`
- Lint rules: `.eslintrc.*` test overrides (by file globs)

If enforcement rules change, update:

- `tests/README.md`
- this file (`tests/GUARDRAILS.md`)
- and the actual checks (so docs never drift from reality)
