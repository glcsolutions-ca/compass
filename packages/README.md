# Packages

## Purpose

The `packages/` workspace contains shared libraries and generated interfaces used by apps and CI policy checks.

## Package Map

| Path                  | Responsibility                                                                     |
| --------------------- | ---------------------------------------------------------------------------------- |
| `packages/contracts/` | Contract schemas and OpenAPI document generation used across API, Worker, and SDK. |
| `packages/sdk/`       | Typed API client built from generated OpenAPI schema.                              |
| `packages/testkit/`   | Shared test helpers and runtime guardrails for policy-aligned test isolation.      |

## Contract Generation Flow

1. Update source contracts in `packages/contracts/src/**`.
2. Regenerate OpenAPI document:

```bash
pnpm --filter @compass/contracts generate
```

3. Regenerate SDK schema/types from OpenAPI:

```bash
pnpm --filter @compass/sdk generate
```

4. Verify generated artifacts are in sync:

```bash
pnpm check:contract
```

## Consumer Relationships

- `apps/api` and `apps/worker` import types/schemas from `@compass/contracts`.
- `apps/web` consumes `@compass/sdk` for typed client access.
- `@compass/sdk` consumes `@compass/contracts/openapi/openapi.json` as generation input.

## Package READMEs

- Contracts: [`packages/contracts/README.md`](./contracts/README.md)
- SDK: [`packages/sdk/README.md`](./sdk/README.md)
- Testkit: [`packages/testkit/README.md`](./testkit/README.md)
