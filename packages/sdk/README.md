# SDK Package

## Purpose

`@compass/sdk` provides a typed API client generated from Compass OpenAPI contracts.

## Generated Schema Source

`src/generated/schema.ts` is generated from:

- `../contracts/openapi/openapi.json`

This keeps SDK path and operation typing aligned with the contracts package.

## Client Usage Example

```ts
import { createApiClient, getHealth, getPing } from "@compass/sdk";

const client = createApiClient({
  baseUrl: "http://localhost:3001"
});

const health = await getHealth(client);
const ping = await getPing(client);

console.log(health.status, ping.service);
```

Direct operation call example:

```ts
const result = await client.GET("/v1/ping");

if (result.data) {
  console.log(result.data.ok);
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
- `pnpm contract:check` verifies generated artifacts are committed and in sync.

## Local Commands

Exact local commands from `packages/sdk/package.json`:

- `pnpm --filter @compass/sdk build`
- `pnpm --filter @compass/sdk generate`
- `pnpm --filter @compass/sdk lint`
- `pnpm --filter @compass/sdk test`
- `pnpm --filter @compass/sdk typecheck`
