# Release Stage Runbook

## Purpose

Release takes an accepted candidate and deploys it to production.

## Sequence

1. verify acceptance attestation
2. apply support Bicep when `infra/azure/**` changed
3. deploy candidate digests to `api-stage` and `web-stage`
4. run read-only stage smoke
5. run migrations against production DB
6. deploy the same digests to `api-prod` and `web-prod`
7. run production smoke
8. record release evidence and attestation

## Stage safety rule

Stage apps share the production DB and Key Vault.

Stage smoke must therefore stay read-only.

## Rollback

Rollback means rerunning Release with a previous accepted `candidate_id`.
