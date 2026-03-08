# Release Stage Runbook

## Purpose

Release takes an accepted candidate and deploys it to production without rebuilding it.

## Trigger modes

- successful `Acceptance` completion inside `30 Release`

## Sequence

Forward release:

1. verify acceptance attestation
2. deploy candidate digests to `api-stage` and `web-stage`
3. run read-only stage health smoke
4. run migrations against production DB
5. run stage auth smoke
6. deploy the same digests to `api-prod` and `web-prod`
7. run production smoke
8. record release evidence and attestation

## Mainline rule

If release fails, the line is unhealthy. The expected response is to stop the line, then fix forward before allowing later releases to continue.

## Stage safety rule

Stage apps share the production DB and Key Vault.

Stage smoke must therefore stay read-only.

The Entra auth-start smoke runs after migrations because OIDC request persistence depends on the migrated database schema.

Stage apps intentionally remain at `minReplicas=0` for cost control. Release therefore accepts cold-start latency instead of adding stage warm-up orchestration.

Release summaries still include basic elapsed time for operator visibility, but detailed performance diagnostics are intentionally not treated as a first-class part of the pipeline design.
