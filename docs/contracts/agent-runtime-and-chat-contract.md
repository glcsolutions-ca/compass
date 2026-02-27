# Agent Runtime and Chat Contract

## Purpose

This document defines the canonical Compass runtime/chat contract that sits on top of the
generated Codex protocol and `@compass/contracts`.

It complements auth/session docs and focuses on:

1. Runtime account/auth operations
2. Thread/turn/event operations
3. Provider behavior by environment

## Source of Truth

1. API boundary schemas: `packages/contracts/src/agent-gateway.ts`
2. OpenAPI generation: `packages/contracts/src/openapi.ts`
3. Runtime protocol generation: `packages/codex-protocol/generated/**`
4. Runtime core client: `packages/codex-runtime-core/src/index.js`
5. API route implementation: `apps/api/src/app.ts`, `apps/api/src/agent-service.ts`

## HTTP and WebSocket Surface (`/v1/agent`)

### Runtime account/auth

1. `POST /v1/agent/runtime/account/read`
2. `POST /v1/agent/runtime/account/login/start`
3. `POST /v1/agent/runtime/account/login/cancel`
4. `POST /v1/agent/runtime/account/logout`
5. `POST /v1/agent/runtime/account/rate-limits/read`
6. `GET /v1/agent/runtime/stream` (websocket upgrade endpoint)

### Threads and turns

1. `POST /v1/agent/threads`
2. `GET /v1/agent/threads/:threadId`
3. `PATCH /v1/agent/threads/:threadId/mode`
4. `POST /v1/agent/threads/:threadId/turns`
5. `POST /v1/agent/threads/:threadId/turns/:turnId/interrupt`
6. `POST /v1/agent/threads/:threadId/events:batch`
7. `GET /v1/agent/threads/:threadId/events`
8. `GET /v1/agent/threads/:threadId/stream` (websocket upgrade endpoint)

## Provider Model

`AGENT_RUNTIME_PROVIDER` controls runtime execution backend:

1. `dynamic_sessions` (cloud/prod)
2. `local_process` (local dev default)
3. `local_docker` (local parity lane)
4. `mock` (deterministic testing)

Behavior contract:

1. Browser clients always go through API (`apps/api`) and never receive Dynamic Sessions credentials.
2. Local providers support interactive runtime account login/logout/rate-limit operations.
3. Cloud provider remains service-managed and keeps runtime credential handling out of web clients.

## Versioning and Drift Rules

1. Generated Codex protocol artifacts are pinned by `packages/codex-protocol/codex-version.json`.
2. Contract changes in `packages/contracts/**` require corresponding docs target updates in the same
   change set.
3. OpenAPI and SDK artifacts must be regenerated after schema edits:
   1. `pnpm --filter @compass/contracts generate`
   2. `pnpm --filter @compass/sdk generate`
   3. `pnpm contract:check`
