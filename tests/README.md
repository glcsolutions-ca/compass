---

# Testing Philosophy

This repo treats tests as **release evidence**. The goal is fast, trustworthy feedback so `main` stays **releasable** and changes ship in **small batches**.

Less is more: we prefer the **cheapest test that gives the confidence we need**.

---

## Principles

1. **Prove it, don’t argue it**
   - Every change should produce **machine-verifiable evidence** (tests + artifacts).

2. **Commit-test suite first**
   - The default PR suite (“commit-stage”) must be **fast**.
   - Deeper tests exist, but run only when risk requires them.

3. **Many small tests, few big tests**
   - We follow the **test pyramid**:
     - Many unit/component tests
     - Some integration/contract tests
     - Very few end-to-end (E2E) UI tests

4. **Deterministic or it doesn’t count**
   - Flaky tests are treated as **bugs**.
   - No sleeps. No timing lotteries. No hidden dependencies.

5. **Test what we actually merge**
   - CI validates the **merge result** (the integrated commit), not just the PR head.

6. **Build once, promote the same artifact**
   - Runtime releases promote immutable artifacts (e.g., image digests). Tests should support this by producing reliable evidence upstream.

---

## Test layers (what we write)

### 0) Static checks (always)

**Purpose:** cheapest correctness signal.

- Format / lint / typecheck
- Forbidden patterns / policy checks
- Contract/schema validation (where applicable)

### 1) Unit tests (many)

**Purpose:** protect core logic and enable refactoring.

- In-process, hermetic, no DB, no network.
- Pure functions and domain rules belong here.

### 2) Component/service tests (many)

**Purpose:** test a unit plus its immediate boundary.
Examples:

- API handlers via in-memory HTTP server
- Worker job logic with faked queue/external clients
- Web components with DOM (no browser automation)

### 3) Contract tests (important, cheap confidence)

**Purpose:** prevent drift between API ↔ Web ↔ SDK.

- Contracts live in `packages/contracts`
- Server responses and client expectations must both match the contract.
- Prefer contract tests over UI tests when possible.

### 4) Integration tests (some, high value)

**Purpose:** verify real wiring with real dependencies.

- Real Postgres
- Migrations apply cleanly
- Critical queries and invariants behave correctly
- Keep the set small and valuable

### 5) E2E UI tests (few, golden paths only)

**Purpose:** prove critical user journeys.

- Real browser (Playwright)
- Full stack running
- Keep this suite tiny and stable

### 6) Post-deployment verification gate tests (minimal)

**Purpose:** confirm the deployed system is alive.

- Health endpoint
- One authenticated call
- One “page loads” check (when UI is relevant)

---

## What runs when (CI policy)

### PR preview (`commit-stage` workflow, optional)

PR runs are preview feedback only.

- Static checks
- Unit tests
- Component/service tests
- Contract tests

Target: minutes, not hours.

### Push to `main` (authoritative gates)

Pushes to `main` are the release evidence source of truth.

- `commit-stage` gate (fast commit-test + policy checks)
- `integration-gate` (push-only integration confidence checks)
  - includes build/compile, migration safety (when needed), auth-critical in-process smoke, and runtime integration tests

### Post-deployment verification

Cloud deployment verification (after promotion/deploy) runs:

- API smoke verification
- Browser smoke verification (Playwright evidence)

### Local deep suite (author-driven)

- `pnpm test:full` remains available locally when deeper pre-push confidence is needed.

---

## Non-negotiables (rules that prevent test rot)

### Determinism rules

- No `sleep()` to “wait for things.” Poll on a real readiness condition.
- Control time: inject a clock, use fake timers, or fix the system time in tests.
- Seed randomness. If data is random, it must be reproducible.

### Isolation rules

- Unit tests: no DB, no network.
- Integration tests: real DB is allowed; external APIs must be mocked at the boundary.
- Tests must be runnable locally with a single command.

### Flake policy

- A flaky test is a production bug in the factory.
- Fix it quickly or quarantine it with:
  - clear owner
  - clear reason
  - expiry date

No indefinite quarantines.

---

## Directory conventions

- Unit/component tests: colocated with code
  - `apps/*/src/**`
  - `packages/*/src/**`

- Integration tests:
  - `apps/api/test/integration/**` (or equivalent per app)

- E2E tests (Playwright):
  - `tests/e2e/**`

- System/smoke tests:
  - `tests/system/**` and/or `tests/smoke/**`

- Shared test helpers (“testkit”):
  - `packages/testkit/**` (factories, clocks, DB helpers, HTTP helpers)

---

## Standard scripts (recommended)

We standardize on predictable entrypoints so CI and humans run the same commands:

- `pnpm test`  
  Commit-stage suite (fast)

- `pnpm test:full`  
  Commit-stage + integration (+ optional E2E if required)

- `pnpm test:unit` / `pnpm test:integration` / `pnpm test:e2e`  
  Targeted runs for debugging

CI should call these scripts directly (avoid “CI-only magic”).

---

## “Start here” for new contributors

If you’re adding a feature:

1. Add/extend unit/component tests first.
2. Add contract tests for boundary changes.
3. Add a small number of integration tests for DB or wiring changes.
4. Add/extend E2E only when the behavior can’t be proven cheaper.

If you’re fixing a bug:

- First add a test that fails in the old behavior and passes with the fix.
- Prefer the smallest layer that reproduces the issue.

---

## References (concepts, not doctrine)

- E2E suite README: `tests/e2e/README.md`
- System smoke README: `tests/system/README.md`
- Test pyramid: https://martinfowler.com/articles/practical-test-pyramid.html
- Continuous Delivery / deployment pipeline concepts: https://continuousdelivery.com/implementing/patterns/
- “Wide not long” pipeline guidance: https://continuousdelivery.com/2010/09/deployment-pipeline-anti-patterns/
- Harness engineering (agent-friendly repo practices): https://openai.com/index/harness-engineering/
