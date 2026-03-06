# Release Stage Runbook

## Purpose

Release takes an accepted candidate and deploys it to production before GitHub advances `main`.

## Trigger modes

Normal delivery:

- `merge_group` inside `01 Cloud Development Pipeline`

Manual recovery redeploy:

```sh
gh workflow run 01-cloud-development-pipeline.yml --ref main -f candidate_id=sha-<previous-released-candidate>
```

## Sequence

Forward release (`merge_group`):

1. verify acceptance attestation
2. apply support Bicep when `infra/azure/**` changed in the merge-group revision
3. deploy candidate digests to `api-stage` and `web-stage`
4. run read-only stage health smoke
5. run migrations against production DB
6. run stage auth smoke
7. deploy the same digests to `api-prod` and `web-prod`
8. run production smoke
9. record release evidence and attestation

Manual recovery redeploy (`workflow_dispatch`):

1. verify prior release attestation
2. deploy candidate digests to `api-stage` and `web-stage`
3. run read-only stage health smoke
4. run stage auth smoke
5. deploy the same digests to `api-prod` and `web-prod`
6. run production smoke
7. record release evidence and attestation

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

### Observed recovery drill

Recovery drill executed on 2026-03-06 UTC:

1. rolled production back from `sha-145da49c74332efde081243866a507ac4db245d7`
2. redeployed previously released candidate `sha-d2cdc4cfd431d5c26d432f58b2d9aff5b1368e7f`
3. verified:
   - `https://compass.glcsolutions.ca` returned `200`
   - `/v1/auth/entra/start` returned `302`
   - redirect URI remained `https://compass.glcsolutions.ca/v1/auth/entra/callback`
4. restored production to `sha-145da49c74332efde081243866a507ac4db245d7`

### Operational note

Because this simplified model uses long-lived stage/prod app pairs instead of revision traffic switching:

- recovery redeploy is a previously released-candidate redeploy, not a traffic flip
- stage smoke must remain read-only because stage shares the production DB and Key Vault
- database changes must stay backward-compatible across the release window
- if recovery requires schema or infra reversal, recovery redeploy is unsupported and the correct response is a forward fix

Release summaries still include basic elapsed time for operator visibility, but detailed performance diagnostics are intentionally not treated as a first-class part of the pipeline design.
