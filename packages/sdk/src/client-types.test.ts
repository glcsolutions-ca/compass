import type { Client } from "openapi-fetch";
import { describe, expectTypeOf, it } from "vitest";
import { createApiClient } from "./client.js";
import type { ApiOperations, ApiPaths } from "./index.js";

describe("createApiClient", () => {
  it("returns a client typed with ApiPaths", () => {
    const client = createApiClient({ baseUrl: "http://localhost:3001" });
    expectTypeOf(client).toEqualTypeOf<Client<ApiPaths>>();
  });

  it("keeps /health operation aligned to generated schema operation types", () => {
    type HealthPathGet = ApiPaths["/health"]["get"];
    type HealthOperation = ApiOperations["getHealth"];
    type HealthResponse =
      ApiOperations["getHealth"]["responses"][200]["content"]["application/json"];

    expectTypeOf<HealthPathGet>().toEqualTypeOf<HealthOperation>();
    expectTypeOf<HealthResponse>().toEqualTypeOf<{
      status: "ok";
      timestamp: string;
    }>();
  });
});
