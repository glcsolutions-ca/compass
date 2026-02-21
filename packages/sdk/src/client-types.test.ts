import type { Client } from "openapi-fetch";
import { describe, expectTypeOf, it } from "vitest";
import { createApiClient } from "./client.js";
import type { ApiPaths } from "./index.js";

describe("createApiClient", () => {
  it("returns a client typed with ApiPaths", () => {
    const client = createApiClient({ baseUrl: "http://localhost:3001" });
    expectTypeOf(client).toEqualTypeOf<Client<ApiPaths>>();
  });
});
