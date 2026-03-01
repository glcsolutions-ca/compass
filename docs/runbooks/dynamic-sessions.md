# Dynamic Sessions Runbook

Purpose: operate Dynamic Sessions runtime image, identity, and convergence checks.

## When To Use

- runtime image rollout
- pool/identity wiring updates
- acceptance rehearsal for existing release candidate

## Inputs

- release candidate SHA
- pool name and executor identity name
- required Azure and Key Vault config

## Steps

1. Build/publish runtime image through standard cloud pipeline.
2. Deploy using release candidate manifest.
3. Run dynamic sessions convergence verification.
4. Run compatibility verification.

## Verify

- convergence checks pass
- runtime compatibility checks pass
- release decision remains YES

## Failure Handling

- fix identity/pool/network config
- replay same release candidate SHA after correction
