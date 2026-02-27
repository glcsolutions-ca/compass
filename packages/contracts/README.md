# Contracts Package

## Purpose

`@compass/contracts` is the schema and API contract source of truth for cross-service boundaries.

## Public Exports

- Root export (`@compass/contracts`) re-exports:
  - `schemas` (`HealthResponseSchema`, `ApiErrorSchema`, types)
  - OpenAPI document builder (`buildOpenApiDocument`, `API_VERSION`)
  - message envelope schema (`EventEnvelopeSchema`, `EventEnvelope` type)
  - agent gateway request/response/stream schemas (`src/agent-gateway.ts`)
  - codex gateway compatibility aliases (`src/codex-gateway.ts`)
- Package export path: `@compass/contracts/openapi/openapi.json`

## Source-of-Truth Files

| Path                             | Role                                                                       |
| -------------------------------- | -------------------------------------------------------------------------- |
| `src/schemas.ts`                 | Core response/error schema definitions and inferred types.                 |
| `src/openapi.ts`                 | OpenAPI registry and path registration logic.                              |
| `src/messages/event-envelope.ts` | Event envelope schema used by async worker processing.                     |
| `src/agent-gateway.ts`           | Canonical agent gateway HTTP/websocket payload schemas.                    |
| `src/codex-gateway.ts`           | Compatibility aliases for codex naming during transition.                  |
| `src/generate-openapi.ts`        | Generator that writes `openapi/openapi.json`.                              |
| `openapi/openapi.json`           | Generated OpenAPI artifact consumed by SDK generation and contract checks. |

## OpenAPI Generation

Generate OpenAPI from source contracts:

```bash
pnpm --filter @compass/contracts generate
```

## Change Rules

1. Edit source files under `src/**`; do not hand-edit generated `openapi/openapi.json`.
2. Regenerate contracts after source changes.
3. Regenerate SDK schema after OpenAPI changes:

```bash
pnpm --filter @compass/sdk generate
```

4. Run contract drift check:

```bash
pnpm contract:check
```

### Change Safety

This package is in docs-critical drift scope (`packages/contracts/**`). Keep docs and runbook indexes updated in the same PR when contract behavior changes.

## Consumers

- `apps/api`: endpoint schemas and OpenAPI alignment.
- `apps/worker`: event envelope validation (`EventEnvelopeSchema`).
- `packages/sdk`: generated client schema source (`openapi/openapi.json`).

## Local Commands

Exact local commands from `packages/contracts/package.json`:

- `pnpm --filter @compass/contracts build`
- `pnpm --filter @compass/contracts generate`
- `pnpm --filter @compass/contracts lint`
- `pnpm --filter @compass/contracts test`
- `pnpm --filter @compass/contracts typecheck`
