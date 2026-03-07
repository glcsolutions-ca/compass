# Unified Session-Host Prototype

Validated in-repo on March 6, 2026.

This spike implements the current target session runtime architecture:

- `apps/api` is the only control plane
- one shared runtime protocol is used in every environment
- one shared runtime agent is used in every environment
- local development uses `local API -> local runtime agent`
- cloud execution uses `cloud API -> Azure Dynamic Sessions -> runtime agent`
- the runtime agent currently runs an echo responder instead of Codex

The goal is to prove the control-plane/runtime contract and execution model,
not to ship the final Codex integration yet.

## Code Layout

- `packages/runtime-protocol/*`
- `packages/runtime-agent/*`
- `apps/api/src/modules/runtime/*`
- `apps/api/src/infrastructure/runtime-hosts/*`
- `platform/scripts/dev/session-prototype/*`

## Public API Surface

- `POST /v1/threads`
- `GET /v1/threads/:threadId`
- `POST /v1/threads/:threadId/turns`
- `POST /v1/threads/:threadId/runtime/launch`

The public session surface is `/v1/threads/...` and `/v1/runtime/...`. Local development defaults to
`executionMode=local` and `executionHost=desktop_local`.

## Runtime Flow

1. Client creates or reuses a thread through the API.
2. A turn hits the API control plane through `/v1/threads/:threadId/turns`.
3. The API resolves the thread host:
   - `desktop_local` -> spawn or reuse a local runtime agent
   - `dynamic_sessions` -> bootstrap or reuse an Azure runtime agent
4. The runtime agent connects back to `/internal/runtime-agent/connect`.
5. The API sends `turn.run`.
6. The runtime agent replies with `turn.result`.
7. The API returns the turn result synchronously.

## Required API Environment

Add these to `apps/api/.env.local` for local development:

```bash
AGENT_DEFAULT_EXECUTION_MODE=local
AGENT_RUNTIME_PROVIDER=local_process
AGENT_SESSION_CONNECT_SECRET=<optional-fixed-secret>
AGENT_SESSION_BOOTSTRAP_TIMEOUT_MS=30000
AGENT_SESSION_RESPONSE_TIMEOUT_MS=20000
AGENT_SESSION_LOCAL_WORK_ROOT=.artifacts/runtime-agents
AUTH_MODE=mock
```

For Azure parity validation, add:

```bash
API_PUBLIC_BASE_URL=https://<stable-public-api-url>
DYNAMIC_SESSIONS_POOL_MANAGEMENT_ENDPOINT=<azure-session-management-endpoint>
DYNAMIC_SESSIONS_BEARER_TOKEN=<azure-bearer-token-or-leave-blank-for-mi>
DYNAMIC_SESSIONS_TOKEN_RESOURCE=https://dynamicsessions.io
DYNAMIC_SESSIONS_EXECUTOR_CLIENT_ID=
```

## Manual Prototype Scripts

- `platform/scripts/dev/session-prototype/create-session-pool.sh`
- `platform/scripts/dev/session-prototype/start-api-tunnel.sh`
- `platform/scripts/dev/session-prototype/smoke-chat-runtime.mjs`

## Local Development Validation

1. Start the local dev stack:

   ```bash
   pnpm dev
   ```

2. Run the smoke test:

   ```bash
   node platform/scripts/dev/session-prototype/smoke-chat-runtime.mjs
   ```

3. Confirm:
   - first turn returns `connectionState: "bootstrapped"`
   - second turn returns `connectionState: "reused"`
   - both turns share the same `sessionIdentifier`

## Azure Parity Validation

1. Create the Azure session pool:

   ```bash
   platform/scripts/dev/session-prototype/create-session-pool.sh
   ```

2. Expose a stable public API URL:

   ```bash
   PORT=3001 platform/scripts/dev/session-prototype/start-api-tunnel.sh
   ```

3. Put that public URL in `API_PUBLIC_BASE_URL`.

4. Start the API and run the smoke test in cloud mode:

   ```bash
   EXECUTION_MODE=cloud EXECUTION_HOST=dynamic_sessions \
     node platform/scripts/dev/session-prototype/smoke-chat-runtime.mjs
   ```

5. Confirm the same `bootstrapped -> reused` behavior through Azure.

## What This Proves

- The API can act as the only control plane.
- One runtime protocol works for local and cloud execution.
- The same runtime process can run locally or in Azure.
- The `/v1/threads` and `/v1/runtime` surfaces can stay stable while the host changes underneath.
- The architecture is ready to swap the echo runtime for a Codex bridge later.

## Current Limits

- No Codex integration yet.
- No persistent storage for files or artifacts yet.
- No pipeline or deployment automation changes yet.
- Cloud parity validation still requires a stable public API URL.
