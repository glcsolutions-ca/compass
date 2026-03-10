# Release Stage Runbook

## Purpose

Release Stage takes an accepted candidate and deploys it to production without rebuilding it.

## Trigger

- successful `Acceptance Stage` completion inside `20 Continuous Delivery Pipeline`

## Sequence

Forward release:

1. verify the acceptance attestation
2. deploy the candidate digests to `api-stage` and `web-stage`
3. run read-only stage smoke
4. run migrations against the production database
5. run stage auth smoke
6. deploy the same digests to `api-prod` and `web-prod`
7. run production smoke
8. record release evidence and attestation

## Mainline rule

If Release Stage fails, the line is unhealthy. The expected response is to stop the line and fix forward before allowing later releases to continue.

## Stage safety rule

Stage apps share the production DB and Key Vault.

Stage smoke must therefore stay read-only.

The Entra auth-start smoke runs after migrations because OIDC request persistence depends on the migrated database schema.

Stage apps intentionally remain at `minReplicas=0` for cost control. Release accepts cold-start latency rather than adding separate stage warm-up orchestration.
