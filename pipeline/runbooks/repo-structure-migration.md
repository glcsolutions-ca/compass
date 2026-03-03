# Repository Structure Migration Runbook

## Goal

Migrate to canonical `pipeline/` domain layout and standardized test placement with minimal risk.

## Move Matrix

| Legacy Path                              | Target Path                                        |
| ---------------------------------------- | -------------------------------------------------- |
| `pipeline/release-candidate-contract.md` | `pipeline/contracts/release-candidate-contract.md` |
| `pipeline/*.schema.json`                 | `pipeline/contracts/schemas/*.schema.json`         |
| `pipeline/.fixtures/*`                   | `pipeline/contracts/fixtures/*`                    |
| `pipeline/commit-analysis.config.json`   | `pipeline/policies/commit-analysis.config.json`    |
| `scripts/pipeline/*`                     | `pipeline/scripts/*`                               |
| `tests/system/*`                         | `tests/acceptance/system/*`                        |
| `tests/e2e/*`                            | `tests/acceptance/e2e/*`                           |

## Compatibility Strategy

1. Keep thin wrappers in `scripts/pipeline/*` forwarding to `pipeline/scripts/*` for one cycle.
2. Update workflows and package scripts to canonical `pipeline/scripts/*` paths immediately.
3. Remove wrappers only after references are confirmed migrated.

## Rollback Steps

1. Revert latest migration commit.
2. Restore previous directory paths and command targets.
3. Re-run `pnpm test:quick` and `pnpm test:rc`.
4. Re-apply migration incrementally with failing reference fixed first.
