import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "./openapi.js";

describe("buildOpenApiDocument", () => {
  it("exposes baseline system paths and operation ids", () => {
    const document = buildOpenApiDocument() as {
      openapi?: string;
      paths?: Record<string, { get?: { operationId?: string } }>;
    };

    expect(document.openapi).toBe("3.1.0");
    expect(document.paths?.["/health"]).toBeTruthy();
    expect(document.paths?.["/v1/ping"]).toBeTruthy();
    expect(document.paths?.["/health"]?.get?.operationId).toBe("getHealth");
    expect(document.paths?.["/v1/ping"]?.get?.operationId).toBe("getPing");
  });
});
