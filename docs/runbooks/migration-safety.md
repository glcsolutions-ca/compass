# Migration Safety Runbook

Purpose: reduce production risk for schema/data changes.

## Policy

Migration behavior is defined by `migration-runbook.md`.

## Safety Rules

- validate with `pnpm db:migrate:check` before apply
- keep migration changes small and reversible
- serialize production mutation steps
- confirm post-apply smoke checks before release decision

## Verify

- migration artifact and deployment artifact are present
- release decision remains YES

## Failure Handling

- stop further promotion
- fix forward or revert based on blast radius and recovery time
