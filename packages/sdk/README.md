# SDK Package

## Purpose

`@compass/sdk` provides a typed API client and generated API types for Compass consumers.
The client supports static bearer tokens, async token providers with one-time 401 refresh retry,
and optional typed auth exceptions for 401/403 responses.

## Generated Schema Source

`src/generated/schema.ts` is generated from:

- `../contracts/openapi/openapi.json`

This keeps SDK path/operation typing aligned with the contracts package.

## Client Usage Example

```ts
import { createApiClient } from "@compass/sdk";

const client = createApiClient({
  baseUrl: "http://localhost:3001"
});

const result = await client.GET("/health");
```

Token-provider example:

```ts
const client = createApiClient({
  baseUrl: "http://localhost:3001",
  tokenProvider: async ({ reason }) => {
    const token = await exchangeToken(reason);
    return {
      token: token.value,
      expiresAtEpochSeconds: token.expiresAtEpochSeconds
    };
  }
});
```

Enable typed auth exceptions:

```ts
import { ApiForbiddenError, createApiClient } from "@compass/sdk";

const client = createApiClient({
  baseUrl: "http://localhost:3001",
  tokenProvider: async () => ({ token: "token-value" }),
  throwOnAuthError: true
});

try {
  await client.GET("/v1/me");
} catch (error) {
  if (error instanceof ApiForbiddenError) {
    console.error(error.errorCode, error.details);
  }
}
```

## Regeneration

Regenerate SDK schema/types from contracts OpenAPI:

```bash
pnpm --filter @compass/sdk generate
```

Regenerate full contract+SDK chain:

```bash
pnpm contract:generate
```

## Type Alignment Checks

- `src/client-types.test.ts` asserts API path and operation type alignment.
- `pnpm check:contract` verifies generated artifacts are committed and in sync.

## Local Commands

Exact local commands from `packages/sdk/package.json`:

- `pnpm --filter @compass/sdk build`
- `pnpm --filter @compass/sdk generate`
- `pnpm --filter @compass/sdk lint`
- `pnpm --filter @compass/sdk test`
- `pnpm --filter @compass/sdk typecheck`
