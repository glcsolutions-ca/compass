# Release Stage Runbook

## Purpose

Release takes an accepted candidate and deploys it to production.

## Sequence

1. verify acceptance attestation
2. apply support Bicep when `infra/azure/**` changed
3. deploy candidate digests to `api-stage` and `web-stage`
4. run read-only stage health smoke
5. run migrations against production DB
6. run stage auth smoke
7. deploy the same digests to `api-prod` and `web-prod`
8. run production smoke
9. record release evidence and attestation

## Stage safety rule

Stage apps share the production DB and Key Vault.

Stage smoke must therefore stay read-only.

The Entra auth-start smoke runs after migrations because OIDC request persistence depends on the migrated database schema.

## Rollback

Rollback means rerunning Release with a previous accepted `candidate_id`.
