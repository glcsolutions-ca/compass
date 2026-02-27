# Agent Runtime Groundwork Runbook

## Purpose

Operate and verify the dual-mode groundwork (`cloud` + `local`) without changing tenant-facing product contracts.

## Preconditions

1. Database has migration `1772161000000_agent_runtime_groundwork.mjs` applied.
2. API is running with agent feature flags enabled as needed.
3. Dynamic Sessions runtime image is deployed for cloud mode execution.
4. Desktop app is running for local mode validation.

## Required Environment Flags

1. `AGENT_GATEWAY_ENABLED=true`
2. `AGENT_CLOUD_MODE_ENABLED=true`
3. `AGENT_LOCAL_MODE_ENABLED_DESKTOP=true`
4. `AGENT_MODE_SWITCH_ENABLED=true`

## Smoke Validation (Cloud)

1. Create thread:
   - `POST /v1/agent/threads` with `{ tenantSlug, executionMode:"cloud" }`
2. Start turn:
   - `POST /v1/agent/threads/{threadId}/turns` with `{ text }`
3. Read event timeline:
   - `GET /v1/agent/threads/{threadId}/events`
4. Optional websocket stream:
   - `GET /v1/agent/threads/{threadId}/stream` (upgrade)

Expected: turn lifecycle events persist in `agent_events` and are streamable in order.

## Smoke Validation (Local Desktop)

1. In desktop app, select `Local` mode for a chat thread.
2. Submit a prompt.
3. Confirm renderer receives local response from preload IPC.
4. Confirm local turn events are uplinked via `events:batch` and visible in API event timeline.

Expected: local mode uses same `threadId`, emits `turn.started -> item.delta -> turn.completed`, and persists those events in API store.

## Mode Switch Rules

1. Switches are only allowed when no turn is `inProgress`.
2. Switches update `agent_threads.execution_mode` and append `thread.modeSwitched` event.
3. Attempted switch during active turn returns `409` with `AGENT_THREAD_BUSY`.

## Local Credential Storage

1. Local credentials/auth state are persisted only from Electron main process.
2. Storage uses Electron `safeStorage` (OS-backed encrypted blob).
3. Renderer must never read/write secrets directly.

## Verification Commands

1. `pnpm --filter @compass/api test`
2. `pnpm --filter @compass/web test`
3. `pnpm --filter @compass/desktop test`
4. `pnpm --filter @compass/codex-session-runtime test`
5. `pnpm typecheck:refs`
