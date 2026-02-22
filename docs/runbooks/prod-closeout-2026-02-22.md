# Production Closeout Tracker (2026-02-22)

## Scope

Closeout for the ACR-first production path after green deploy and infra convergence.

## Baseline Lock

- Checkpoint tag pushed:
  - `prod-checkpoint-2026-02-22-acr-closeout`
- Checkpoint commit:
  - `5cae0671b2372eb6c7b6aee8a06f9cbfa10d0318`
- Baseline workflow runs:
  - Deploy: https://github.com/glcsolutions-ca/compass/actions/runs/22280948392
  - Infra Apply: https://github.com/glcsolutions-ca/compass/actions/runs/22280654498

## Stored Evidence Links

- Deploy artifacts (current retained artifacts on run `22280948392`):
  - https://github.com/glcsolutions-ca/compass/actions/runs/22280948392/artifacts/5608150585
  - https://github.com/glcsolutions-ca/compass/actions/runs/22280948392/artifacts/5608150618
- Infra baseline artifact:
  - https://github.com/glcsolutions-ca/compass/actions/runs/22280654498/artifacts/5607930325

## Deterministic Replay Checks

- Infra idempotency replay:
  - Run: https://github.com/glcsolutions-ca/compass/actions/runs/22281333224
  - Result: `success`
  - Artifact: https://github.com/glcsolutions-ca/compass/actions/runs/22281333224/artifacts/5608127079
- Deploy replay (same run id, rerun attempt):
  - Run: https://github.com/glcsolutions-ca/compass/actions/runs/22280948392
  - Attempt: `2`
  - Result: `success`
  - Gates verified: migration job, API smoke, browser evidence.

## Rollback Drill

- Completed manual rollback drill in ACA multiple revisions mode:
  - Shifted API and Web traffic to previous healthy revisions.
  - Verified API `/health` and Web root while on rollback target.
  - Restored traffic to current revisions.
  - Re-verified API `/health` and Web root after restore.
- Post-drill traffic state:
  - API: 100% on current revision.
  - Web: 100% on current revision.

## Environment/Secret Contract Audit

- Legacy GHCR credentials are absent in `production`:
  - `GHCR_USERNAME`: not present.
  - `GHCR_PASSWORD`: not present.
- Required ACR/Azure/Entra vars and required deploy/infra secrets: present.

## Observability Window

- Start time: 2026-02-22 UTC
- Monitor for 24-48 hours:
  - API `5xx` rate and latency
  - migration job failures
  - auth `401/403` trend
- Exit criteria:
  - No sustained regression across the metrics above
  - Rollout marked closed and follow-up backlog item tracked
