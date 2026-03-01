# Auth V1 Pilot Readiness Runbook

Purpose: verify readiness and operate limited pilot rollout.

## When To Use

- before enabling pilot tenants
- after auth or identity configuration changes

## Inputs

- pilot tenant list
- acceptance and production environment variable access
- release candidate SHA if replay is needed

## Steps

1. Confirm required env vars and Key Vault secrets exist.
2. Confirm latest release candidate passed quality gates.
3. Run replay if you need deterministic re-verification for a specific SHA.
4. Validate login and API authorization for pilot tenants.

## Verify

- `commit-stage` and `integration-gate` pass
- cloud release decision is YES
- pilot tenant auth paths succeed

## Failure Handling

- stop pilot expansion
- fix forward or revert
- replay only after corrective change
