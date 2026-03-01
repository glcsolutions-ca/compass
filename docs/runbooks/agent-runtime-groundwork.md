# Agent Runtime Groundwork Runbook

Purpose: verify baseline runtime behavior for cloud/local agent execution.

## When To Use

- validating runtime groundwork changes
- confirming feature-flag wiring

## Inputs

- local env configured
- DB available for API/runtime checks

## Steps

1. Run targeted unit tests for changed runtime surfaces.
2. Run `pnpm typecheck:refs`.
3. Run `pnpm test:quick`.
4. If integration behavior changed, run `pnpm test:full`.

## Verify

- required tests pass
- no contract drift
- no docs drift

## Failure Handling

- fix forward on `main`
- revert if deterministic break cannot be corrected quickly
