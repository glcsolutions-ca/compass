# Troubleshooting

Purpose: fast diagnosis for common pipeline failures.

Canonical model: `../development-pipeline.md`.

## `commit-stage` Failure

- Cause: lane checks failed (docs/runtime/desktop/infra/identity).
- Check: `.artifacts/commit-stage/<sha>/result.json`.
- Fix: correct the issue and push.

## `acceptance-stage` Failure

- Cause: automated acceptance tests, integration testing, package-once contract, or staging rehearsal failed.
- Check: `.artifacts/acceptance-stage/<sha>/result.json` and `.artifacts/release-candidate/<sha>/manifest.json`.
- Fix: correct the issue on the PR branch and re-run merge queue.

## Cloud Pipeline Failure

- Cause: release-candidate load, promotion (traffic shift or deploy), smoke, or release decision failed.
- Check: `.artifacts/release-candidate/<sha>/manifest.json`, `.artifacts/infra/<sha>/deployment.json`, `.artifacts/deploy/<sha>/api-smoke.json`, `.artifacts/release/<sha>/decision.json`.
- Fix: promotion is halted automatically; fix forward and rerun, or replay with `release_candidate_sha`.
- Rule: do not expect automatic Git revert. Use an explicit human-authored revert commit only when needed.
