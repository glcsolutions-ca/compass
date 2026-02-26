# Auth V1 Pilot Readiness Runbook

Use this runbook to operate and close out the post-launch auth v1 pilot.

## Scope

- Entra-only auth v1 production pilot
- Two allow-listed tenants
- Manual daily spot-check operations
- Strict 14-day stability gate

Out of scope:

- local auth/MFA
- SCIM
- custom role catalog
- BYO IdP

## Tenant Roster (Pilot)

| Label | Domain            | Entra Tenant ID                        | Pilot Status |
| ----- | ----------------- | -------------------------------------- | ------------ |
| GLC   | `glcsolutions.ca` | `<entra-tenant-id-a>` | Active       |
| Kropp | `kropp.ca`        | `<entra-tenant-id-b>` | Active       |

## Baseline Configuration

Ensure both GitHub environments (`acceptance`, `production`) include:

- `ENTRA_ALLOWED_TENANT_IDS=<entra-tenant-id-a>,<entra-tenant-id-b>`
- `API_SMOKE_ALLOWED_TENANT_ID=<entra-tenant-id-a>` (GLC only)

Validation commands:

```bash
gh variable list -e acceptance
gh variable list -e production
```

## Deployment Convergence

After any auth-related environment changes, run replay against a runtime-capable release-candidate SHA:

```bash
gh workflow run "Cloud Deployment Pipeline Replay" \
  -f release_candidate_sha=804fd607b457ed7b43859912ac541a3681c68b2e
```

Then monitor and confirm success:

```bash
gh run list --workflow "Cloud Deployment Pipeline Replay" --limit 5
gh run watch <run-id>
```

Latest replay evidence (pilot rollout):

- Run ID: `22456494173`
- Workflow: `Cloud Deployment Pipeline Replay`
- Triggered: `2026-02-26T18:52:10Z`
- Release candidate SHA: `804fd607b457ed7b43859912ac541a3681c68b2e`
- Result: success (`deploy-runtime`, `production-blackbox-verify`, `release-decision` all green)
- Run URL: <https://github.com/glcsolutions-ca/compass/actions/runs/22456494173>

## Daily Verification Checklist (14 Days)

Record one row per day and mark all checks pass/fail.

### Core Public Checks

1. `GET https://compass.glcsolutions.ca/health` returns `200`
2. `GET https://compass.glcsolutions.ca/openapi.json` returns `200`
3. `GET https://compass.glcsolutions.ca/v1/auth/me` (anonymous) returns `401`
4. `GET https://compass.glcsolutions.ca/v1/auth/entra/start?returnTo=%2F` returns `302` and redirect includes:

- host `login.microsoftonline.com`
- path `/organizations/oauth2/v2.0/authorize`
- expected `client_id`
- expected `redirect_uri=https://compass.glcsolutions.ca/v1/auth/entra/callback`

### Tenant Flow Checks

1. GLC tenant login lands on `/workspaces` or `/t/<slug>`
2. Kropp tenant login lands on `/workspaces` or `/t/<slug>`
3. Tenant boundary behavior verified (deny non-member, allow member)
4. Invite flow per tenant:

- owner/admin can create invite
- invited user can accept
- same-user replay is idempotent-safe
- different-user replay returns `409 INVITE_ALREADY_ACCEPTED`

### Daily Record Template

| Day | Date (UTC) | Health    | OpenAPI   | AuthMe 401 | AuthStart Redirect | GLC Login | Kropp Login | Invite Flow | Boundary Checks | Incidents      | Operator |
| --- | ---------- | --------- | --------- | ---------- | ------------------ | --------- | ----------- | ----------- | --------------- | -------------- | -------- |
| 1   | YYYY-MM-DD | pass/fail | pass/fail | pass/fail  | pass/fail          | pass/fail | pass/fail   | pass/fail   | pass/fail       | none / see log | name     |

Day 1 recorded evidence:

| Day | Date (UTC) | Health | OpenAPI | AuthMe 401 | AuthStart Redirect | GLC Login | Kropp Login | Invite Flow | Boundary Checks | Incidents | Operator |
| --- | ---------- | ------ | ------- | ---------- | ------------------ | --------- | ----------- | ----------- | --------------- | --------- | -------- |
| 1   | 2026-02-26 | pass   | pass    | pass       | pass               | pass      | pending     | pending     | pending         | none      | codex    |

Day 1 notes:

- Core public checks executed from CLI:
  - `GET /health` -> `200`
  - `GET /openapi.json` -> `200`
  - `GET /v1/auth/me` (anon) -> `401`
  - `GET /v1/auth/entra/start?returnTo=%2F` -> `302` with:
    - host `login.microsoftonline.com`
    - path `/organizations/oauth2/v2.0/authorize`
    - `client_id=<entra-client-id-redacted>`
    - `redirect_uri=https://compass.glcsolutions.ca/v1/auth/entra/callback`
- GLC login marked pass based on successful browser sign-in evidence provided in-thread.
- Kropp tenant login, invite lifecycle, and boundary checks remain pending manual pilot execution.

## Incident Log Template

Use one entry per incident or suspicious auth event.

| Incident ID | Date/Time (UTC)  | Severity (P0/P1/P2/P3) | Tenant         | Symptom | User Impact | Detection | Immediate Mitigation | Root Cause | Corrective Change SHA | Status      |
| ----------- | ---------------- | ---------------------- | -------------- | ------- | ----------- | --------- | -------------------- | ---------- | --------------------- | ----------- |
| AUTH-001    | YYYY-MM-DD HH:MM | P2                     | GLC/Kropp/Both | ...     | ...         | ...       | ...                  | ...        | <sha>                 | open/closed |

Severity policy for gate:

- P0: complete auth outage, critical security exposure, or broad lockout
- P1: high-impact auth failure affecting multiple users/tenants

## Strict Exit Gate Checklist (Must All Pass)

1. No P0 incidents for 14 consecutive days
2. No P1 incidents for 14 consecutive days
3. Daily checklist completed for all 14 days
4. Successful end-to-end login and invite flows proven for both tenants
5. `main` pipeline evidence remains green for pilot-related commits:

- `commit-stage`
- `integration-gate`
- `Cloud Deployment Pipeline` (when triggered)

## Pilot Closeout Report Template

### Timeline

- Pilot start date:
- Pilot end date:
- Total days observed:

### Results

- GLC flow result: pass/fail
- Kropp flow result: pass/fail
- Invite flow result: pass/fail
- Tenant boundary checks: pass/fail

### Incident Summary

- P0 count:
- P1 count:
- P2/P3 notable items:
- Linked incident IDs:

### Gate Decision

- Strict gate pass/fail:
- Go/No-Go:
- Decision date:
- Approver:

### Follow-Up Actions

- If pass: tag release `auth-v1-ga` and open v1.1 permissions planning
- If fail: list blocking corrective actions and revalidation window

## References

- [`entra-sso-setup.md`](./entra-sso-setup.md)
- [`auth-v1-cutover.md`](./auth-v1-cutover.md)
- [`cloud-deployment-pipeline-setup.md`](./cloud-deployment-pipeline-setup.md)
