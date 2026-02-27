# Dynamic Sessions One Pager

## Purpose

This is the production baseline for Azure Container Apps Dynamic Sessions in Compass.
It covers only infrastructure and delivery plumbing, not chat-thread routing logic.

## How It Works

1. Backend calls the Dynamic Sessions pool management endpoint.
2. Requests include an `identifier` so Azure routes to a stable per-session container.
3. Dynamic Sessions forwards the request path to the custom container runtime.
4. Backend authenticates with a managed-identity Entra token scoped to `https://dynamicsessions.io`.

## Current Compass Baseline

1. Dynamic Sessions custom-container pool is deployed from `infra/azure/main.bicep`.
2. Runtime image is `compass-codex-session-runtime` and is digest-pinned through the release-candidate manifest.
3. Runtime is Codex App Server backed (`initialize` -> `initialized`, `thread/start`, `turn/start`, `turn/interrupt` over JSON-RPC v2 stdio).
4. Runtime OpenAI credential is sourced via Key Vault secret reference (`openai-api-key`), never plaintext env values.
5. A dedicated managed identity is provisioned for Session Executor permissions.
6. Session Executor role assignment is scoped to the session pool only.
7. Pool defaults:
   - `readySessionInstances=0`
   - `maxSessionPoolSize=20`
   - `maxConcurrentSessions=20`
   - `cooldownPeriodInSeconds=300`
   - `cpu=0.25`
   - `memory=0.5Gi`
   - `sessionNetworkConfiguration.status=EgressEnabled`

## Security Boundaries

1. Browser clients must never receive Dynamic Sessions access tokens.
2. Browser clients must never receive raw session identifiers.
3. Token minting and session identifier mapping stay server-side.
4. Role scope stays least-privilege (pool-level Session Executor).

## Pipeline Integration

1. `cloud-deployment-pipeline.yml` builds and pushes the Dynamic Sessions runtime image on runtime changes.
2. Release-candidate manifest now includes `dynamicSessionsRuntimeRef`.
3. Push/replay deploy workflows fail-safe to infra convergence whenever runtime/infra convergence is required.
4. `deploy-infra` now verifies Dynamic Sessions convergence after infra apply (`dynamic-sessions-convergence.json` artifact).
5. Replay workflow consumes the same manifest and does not rebuild images.
6. Manual acceptance rehearsal is available in `dynamic-sessions-acceptance-rehearsal.yml` to apply infra and verify Dynamic Sessions convergence for an existing release candidate (no rebuild).
7. Required GitHub environment vars: `DYNAMIC_SESSIONS_POOL_NAME`, `DYNAMIC_SESSIONS_EXECUTOR_IDENTITY_NAME`.
8. Deploy workflows refresh Azure OIDC login after infra apply to avoid token-expiry during post-apply convergence checks.

## Rollout Guardrails

1. Converge through the normal acceptance -> production deployment pipeline only.
2. Keep Session Executor scope at the session-pool resource only.
3. Keep pool defaults cost-minimal until production usage data justifies tuning.
4. Treat pool size, identity, and network mode changes as infra changes requiring full pipeline evidence.

## Operational Notes

1. Dynamic Sessions custom-container pools are Dedicated-plan billed capacity.
2. Baseline sizing is intentionally cost-minimal (`readySessionInstances=0`) and should be tuned with production telemetry.
3. Keep `maxSessionPoolSize` greater than `0`; a zero pool size prevents on-demand session allocation.
4. API cloud mode fails closed when Dynamic Sessions management endpoint or managed-identity token path is unavailable.
5. Changes to pool sizing, identity, or network posture should follow normal acceptance -> production convergence.

## Migration Path

1. Replace `compass-codex-session-runtime` image with the real Codex runtime image (digest-pinned through the same manifest field).
2. Keep cloud execution API-brokered (`client -> API -> Dynamic Sessions runtime`) for tenant isolation and token containment.
3. Add backend conversation/thread -> session `identifier` mapping and Dynamic Sessions request forwarding.
4. Keep browser clients unaware of raw identifiers or Dynamic Sessions tokens.

## Dual-Mode Alignment

1. `cloud` mode uses Dynamic Sessions runtime via API broker.
2. `local` mode (desktop only) uses Electron main-process runtime manager and uplinks local events through `/v1/agent/threads/{threadId}/events:batch`.
3. Both modes persist to the same `agent_events` timeline so history remains thread-continuous.

## Not Yet Implemented

1. Conversation/thread to session `identifier` mapping.
2. Dynamic Sessions request forwarding in product API routes.
