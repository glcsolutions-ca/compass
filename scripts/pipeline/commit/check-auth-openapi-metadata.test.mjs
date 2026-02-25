import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const OPENAPI_PATH = "packages/contracts/openapi/openapi.json";
const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];

function readOpenApiDocument() {
  return JSON.parse(readFileSync(OPENAPI_PATH, "utf8"));
}

describe("openapi baseline contract", () => {
  it("includes baseline routes", () => {
    const document = readOpenApiDocument();
    expect(document?.paths?.["/health"]).toBeTruthy();
    expect(document?.paths?.["/v1/ping"]).toBeTruthy();
  });

  it("does not include runtime oauth security metadata", () => {
    const document = readOpenApiDocument();
    expect(document?.components?.securitySchemes?.oauth2).toBeFalsy();

    const paths = document?.paths ?? {};
    for (const methods of Object.values(paths)) {
      for (const method of HTTP_METHODS) {
        const operation = methods?.[method];
        if (!operation) {
          continue;
        }

        expect(Array.isArray(operation.security)).toBe(false);
      }
    }
  });
});
