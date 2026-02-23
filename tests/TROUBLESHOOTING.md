# Troubleshooting

## Testing Contract failures

- `TC001` wrong test layer path
  - Move file to the expected folder (commit-stage, integration, e2e, or smoke).
- `TC010` focused test (`*.only`)
  - Remove `.only`.
- `TC011` skip/quarantine mismatch
  - Add or fix `tests/quarantine.json` entry, or remove `.skip`.
- `TC020` tooling in wrong layer
  - Move Playwright tests to `tests/e2e/**`.
  - Move DB tests to `apps/**/test/integration/**`.

## Guardrail failures

- `NET001` external network blocked
  - Mock the external dependency boundary.
- `DB001` Postgres blocked in commit-stage
  - Move DB-dependent test to integration.
- `PROC001` child process blocked in commit-stage
  - Keep tests in-process; avoid `child_process`.

## Useful commands

- `pnpm ci:testing-contract`
- `pnpm test`
- `pnpm test:integration`
