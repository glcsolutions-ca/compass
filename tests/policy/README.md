# Test Policy And Enforcement

This folder is the source of truth for policy-driven testing enforcement.
Testing philosophy lives in `tests/README.md`. This folder defines how that philosophy is enforced in CI and local checks.

## Design goals

1. **No special author steps**
   - No tags, annotations, or manual layer selection.
   - Tests are classified by path and naming.
2. **Fail fast**
   - Catch structural violations before dependency install or long test jobs.
3. **Actionable errors**
   - Every failure should include: rule ID, file path, why it matters, concrete fix, and docs link.
4. **Farley-aligned pipeline**
   - Cheap checks first; deeper evidence only when risk requires it.

## Files

- `tests/policy/test-policy.json`: machine-readable policy contract for `scripts/ci/testing-contract.mjs`.
- `tests/policy/test-quarantine.json`: temporary skip metadata used by `TC011`.
- `tests/policy/README.md`: policy, quarantine, and troubleshooting guidance.

## Enforcement layers

### Layer 1: Testing Contract (fastest)

What it enforces:

- Path-to-layer mapping
- No focused tests (`*.only`)
- Skips require quarantine metadata
- Playwright tests only under `tests/e2e/**`
- DB integration tests only under `apps/**/test/integration/**`

When it runs:

- PR preflight, before dependency install

Output:

- `.artifacts/testing-contract/<testedSha>/result.json`

### Layer 2: Runner guardrails (runtime)

- Commit-stage (`pnpm test`): loopback-only network, Postgres blocked
- Integration (`pnpm test:integration`): Postgres allowed, external network blocked by default

### Layer 3: Lint hygiene

- No `*.only`
- No ad-hoc sleeps
- No unseeded randomness (`Math.random`)
- No DB client imports in commit-stage test globs

## Policy schema summary (`test-policy.json`)

- `schemaVersion`: currently `"1"`
- `scanRoots`: tracked roots scanned for test files
- `layers`: glob groups for `commitStage`, `integration`, `e2e`, `smoke`
- `imports`: module lists used by `TC020` checks
- `paths.quarantine`: quarantine file path
- `docs`: links used in contract violation output
- `rules`: enable flags for `TC001`, `TC010`, `TC011`, `TC020`

## Test layer mapping

- Commit-stage: `apps/**/src/**/*.test.ts(x)`, `packages/**/src/**/*.test.ts(x)`
- Integration: `apps/**/test/integration/**/*.test.ts(x)`
- E2E (Playwright): `tests/e2e/**/*.spec.ts(x)`
- Smoke/System: `tests/smoke/**/*.ts(x)` and/or `tests/system/**`

If a test is misplaced, the contract fails with a `git mv` suggestion.

## Quarantine policy (`test-quarantine.json`)

Use quarantine only for short-lived flaky tests.

Each entry must include:

- `id` or `file` (optional `line`)
- `owner`
- `reason`
- `expiresOn` (`YYYY-MM-DD`)

Rules:

- `test.skip` and `describe.skip` fail unless a matching quarantine entry exists.
- Expired entries fail CI.
- Remove quarantine entries as soon as tests are fixed.

## Troubleshooting

### Testing contract rule failures

- `TC001` wrong test layer path
  - Move the file to the expected commit-stage, integration, e2e, or smoke location.
- `TC010` focused test (`*.only`)
  - Remove `.only`.
- `TC011` skip/quarantine mismatch
  - Add or fix an entry in `tests/policy/test-quarantine.json`, or remove `.skip`.
- `TC020` tooling in wrong layer
  - Move Playwright tests to `tests/e2e/**`.
  - Move DB tests to `apps/**/test/integration/**`.

### Runtime guardrail failures

- `NET001` external network blocked
  - Mock the external dependency boundary.
- `DB001` Postgres blocked in commit-stage
  - Move DB-dependent tests to integration.
- `PROC001` child process blocked in commit-stage
  - Keep commit-stage tests in-process; avoid `child_process`.

### Useful commands

- `pnpm ci:testing-contract`
- `pnpm test`
- `pnpm test:integration`

## Update workflow

1. Update `tests/policy/test-policy.json`.
2. Update `tests/policy/test-quarantine.json` when skip metadata changes.
3. Update docs when behavior changes (`tests/README.md` and this file).
4. Run `pnpm ci:testing-contract` and `pnpm test`.
5. Keep `scripts/ci/testing-contract.test.mjs` aligned with policy validation rules.
