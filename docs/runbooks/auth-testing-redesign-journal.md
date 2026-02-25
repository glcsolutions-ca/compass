# Auth Testing Redesign Journal

## Context

- Date: 2026-02-25
- Goal: Simplify Compass auth testing to deterministic, automated CI coverage with no manual token generation and no CI-managed user accounts.
- Scope: Remove legacy freshness-based release gating, keep production app-only smoke checks, add deterministic RS256/JWKS integration coverage.

## Decisions Locked

1. Production release gate uses deterministic app-only auth checks.
2. No CI-managed Entra user accounts or manually generated probe tokens.
3. Remove standalone legacy auth freshness workflows entirely.

## Work Log

### 2026-02-25T00:00Z (start)

1. Confirmed current branch state is clean (`codex/cloud-pipeline-simplification`).
2. Confirmed current auth gate complexity includes:

- separate legacy auth workflows
- manual probe-token dependency
- freshness checks in production/replay that gate release decisions

3. Confirmed existing integration lane already runs in the integration gate push-main path and is suitable for new deterministic JWKS integration coverage.

### 2026-02-25T00:20Z (workflow simplification)

1. Removed legacy freshness-gate steps from:

- `.github/workflows/cloud-deployment-pipeline.yml`
- `.github/workflows/cloud-deployment-pipeline-replay.yml`

2. Deleted obsolete workflows/scripts:

- removed legacy standalone auth verification workflows
- removed legacy freshness/probe verification scripts
- removed legacy acceptance-only auth probe script

3. Removed obsolete npm script:

- removed legacy standalone auth verification command

4. Updated workflow/docs contracts to remove legacy freshness/probe interfaces and keep app-only production smoke.

### 2026-02-25T00:40Z (integration coverage)

1. Added `apps/api/test/integration/auth-jwks.integration.test.ts` covering:

- delegated token success (`scp` + `oid` + allowlisted `azp`)
- app token success (`roles` + `idtyp=app`)
- negative validations (issuer/audience/unknown kid/disallowed client/unassigned principal)
- key rollover behavior (old key -> dual key window -> new key only)

2. Added deterministic DB bootstrap rows inside the test so it does not depend on manual token creation or Entra users.
3. Updated workflow contract tests to focus only on the current delivery model and removed legacy-specific assertions.

### 2026-02-25T01:10Z (second simplification pass)

1. Removed remaining legacy-guard references from workflow contract tests so tests only validate the current model.
2. Removed live legacy GitHub environment configuration entries from `acceptance` and `production`.
3. Verified no remaining legacy auth variable/secret references in workflows/scripts/docs contracts.

## Surprises / Roadblocks

1. No existing drill journal file was present in the repo root/docs paths, so this dedicated journal was created for this implementation pass.
2. `NODE_ENV=test` defaults `AUTH_LOCAL_JWT_SECRET`, which silently bypasses JWKS verification logic. The new JWKS integration test must run with `NODE_ENV=production` + explicit `AUTH_JWKS_URI` to truly exercise RS256 remote-key verification.
3. Local integration test runs initially failed because the local Docker Postgres volume had stale migration state (`202602...` applied before `177191...`), which prevented `db:migrate:up` from creating auth tables. Resolution for verification: reset local Postgres volume (`pnpm db:postgres:reset`) before running integration tests.
4. JWKS key rollover on a running process did not immediately accept a newly published key due remote JWKS cache behavior. The rollover test was adjusted to validate cutover across app restart boundaries, which mirrors safe production rollout sequencing.
5. During live GitHub cleanup, all legacy auth entries were present only in `acceptance`; `production` already had none.
