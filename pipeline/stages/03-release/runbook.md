# Release Stage Runbook

## Purpose

Release takes an accepted candidate and deploys it to production after `main` advances.

## Trigger modes

Normal delivery:

- `push` to `main` inside `01 Cloud Development Pipeline`

Manual recovery redeploy:

```sh
gh workflow run 01-cloud-development-pipeline.yml --ref main -f candidate_id=sha-<previous-released-candidate>
```

## Sequence

Forward release (`push` to `main`):

1. verify acceptance attestation
2. verify the previous `main` commit already completed `Mainline Promotion Complete`
3. apply support Bicep when `infra/azure/**` changed in the merged revision
4. deploy candidate digests to `api-stage` and `web-stage`
5. run read-only stage health smoke
6. run migrations against production DB
7. run stage auth smoke
8. deploy the same digests to `api-prod` and `web-prod`
9. run production smoke
10. record release evidence and attestation

Manual recovery redeploy (`workflow_dispatch`):

1. verify prior release attestation
2. deploy candidate digests to `api-stage` and `web-stage`
3. run read-only stage health smoke
4. run stage auth smoke
5. deploy candidate digests to `api-prod` and `web-prod`
6. run production smoke
7. record release evidence and attestation

## Mainline rule

If post-merge promotion fails, `main` is unhealthy. The expected response is to stop the line, then either revert or fix forward before allowing later releases to continue.

## Stage safety rule

Stage apps share the production DB and Key Vault.

Stage smoke must therefore stay read-only.

The Entra auth-start smoke runs after migrations because OIDC request persistence depends on the migrated database schema.

Stage apps intentionally remain at `minReplicas=0` for cost control. Release therefore accepts cold-start latency instead of adding stage warm-up orchestration.

## Recovery redeploy

The preferred response to production problems is to fix forward with a new candidate through the normal pipeline.

Manual recovery redeploy is a rare fallback. It is only supported for a previously released candidate that remains compatible with the current database schema.

### Manual recovery command

Use the unified development pipeline with a previously released candidate:

```sh
gh workflow run 01-cloud-development-pipeline.yml --ref main -f candidate_id=sha-<previous-released-candidate>
```

That redeploys the previous API and Web artifacts through the same stage -> prod flow used by a normal release, but with the stateful mutation steps removed:

1. deploy to `api-stage` and `web-stage`
2. run read-only stage smoke
3. run stage auth smoke
4. deploy to `api-prod` and `web-prod`
5. run production smoke

It does not:

- apply production Bicep
- run migrations
- attempt database rollback

### Operational note

Because this simplified model uses long-lived stage/prod app pairs instead of revision traffic switching:

- recovery redeploy is a previously released-candidate redeploy, not a traffic flip
- stage smoke must remain read-only because stage shares the production DB and Key Vault
- database changes must stay backward-compatible across the release window
- if recovery requires schema or infra reversal, recovery redeploy is unsupported and the correct response is a forward fix

Release summaries still include basic elapsed time for operator visibility, but detailed performance diagnostics are intentionally not treated as a first-class part of the pipeline design.
