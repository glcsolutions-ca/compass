# Quarantine

Use quarantine only for short-lived flaky tests.

Source of truth: `tests/quarantine.json`

Each entry must include:

- `id` (or `file` + optional `line`)
- `owner`
- `reason`
- `expiresOn` (`YYYY-MM-DD`)

Rules:

- `test.skip`/`describe.skip` is rejected unless a matching quarantine entry exists.
- Expired entries fail CI.
- Remove quarantine as soon as the test is fixed.
