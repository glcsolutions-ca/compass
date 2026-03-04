# Repository Structure Migration Runbook

## Goal

Migrate to canonical stage-first `pipeline/` layout and standardized test placement with minimal risk.

## Move Matrix

| Legacy Path                                         | Target Path                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `pipeline/contracts/*`                              | `pipeline/contracts/*` (unchanged)                                                    |
| `pipeline/scripts/cli-utils.mjs`                    | `pipeline/shared/scripts/cli-utils.mjs`                                               |
| `pipeline/scripts/schema-validator.mjs`             | `pipeline/shared/scripts/schema-validator.mjs`                                        |
| `pipeline/scripts/pipeline-contract-lib.mjs`        | `pipeline/shared/scripts/pipeline-contract-lib.mjs`                                   |
| `pipeline/scripts/validate-release-candidate*`      | `pipeline/shared/scripts/*` + `pipeline/stages/shared-tests/*`                        |
| `pipeline/scripts/fetch-release-candidate*`         | `pipeline/shared/scripts/*` + `pipeline/stages/shared-tests/*`                        |
| `pipeline/scripts/deploy-from-manifest.mjs`         | `pipeline/shared/scripts/deploy-from-manifest.mjs`                                    |
| `pipeline/scripts/verify-from-manifest.mjs`         | `pipeline/shared/scripts/verify-from-manifest.mjs`                                    |
| `pipeline/policies/commit-analysis.config.json`     | `pipeline/stages/01-commit/policies/commit-analysis.config.json`                      |
| `pipeline/scripts/generate-release-candidate*`      | `pipeline/stages/01-commit/scripts/*` and `pipeline/stages/01-commit/tests/*`         |
| `pipeline/scripts/generate-commit-analysis-*`       | `pipeline/stages/01-commit/scripts/*` and `pipeline/stages/01-commit/tests/*`         |
| `pipeline/scripts/record-acceptance-*`              | `pipeline/stages/02-acceptance/scripts/*` and `pipeline/stages/02-acceptance/tests/*` |
| `pipeline/scripts/verify-acceptance-*`              | `pipeline/stages/05-release/scripts/*` and `pipeline/stages/05-release/tests/*`       |
| `pipeline/scripts/record-release-evidence.mjs`      | `pipeline/stages/05-release/scripts/record-release-evidence.mjs`                      |
| `pipeline/runbooks/commit-stage-operating-model.md` | `pipeline/stages/01-commit/runbook.md`                                                |
| `pipeline/runbooks/acceptance-gate.md`              | `pipeline/stages/02-acceptance/runbook.md`                                            |
| `pipeline/runbooks/release-and-rollback.md`         | `pipeline/stages/05-release/runbook.md`                                               |
| `tests/system/*`                                    | `tests/acceptance/system/*`                                                           |
| `tests/e2e/*`                                       | `tests/acceptance/e2e/*`                                                              |

## Compatibility Strategy

1. Move shared script mechanics into `pipeline/shared/scripts/*`.
2. Move stage-specific scripts/tests under `pipeline/stages/<stage>/*`.
3. Rewire workflows and package scripts directly to stage/shared targets.
4. Keep command names stable while only changing script paths.

## Rollback Steps

1. Revert latest migration commit.
2. Restore previous directory paths and command targets.
3. Re-run `pnpm test:quick` and `pnpm test:rc`.
4. Re-apply migration incrementally with failing reference fixed first.
