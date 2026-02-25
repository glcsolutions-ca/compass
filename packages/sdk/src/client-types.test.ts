import type { Client } from "openapi-fetch";
import { describe, expectTypeOf, it } from "vitest";
import { createApiClient } from "./client.js";
import type { ApiOperations, ApiPaths } from "./index.js";

describe("createApiClient", () => {
  it("returns a client typed with ApiPaths", () => {
    const client = createApiClient({ baseUrl: "http://localhost:3001" });
    expectTypeOf(client).toEqualTypeOf<Client<ApiPaths>>();
  });

  it("keeps health and ping operation types aligned", () => {
    type HealthPathGet = ApiPaths["/health"]["get"];
    type HealthOperation = ApiOperations["getHealth"];
    type PingPathGet = ApiPaths["/v1/ping"]["get"];
    type PingOperation = ApiOperations["getPing"];

    expectTypeOf<HealthPathGet>().toEqualTypeOf<HealthOperation>();
    expectTypeOf<PingPathGet>().toEqualTypeOf<PingOperation>();
  });
});
