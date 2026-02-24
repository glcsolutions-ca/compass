import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const OPENAPI_PATH = "packages/contracts/openapi/openapi.json";
const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];
const PUBLIC_PATH_ALLOWLIST = new Set(["/health", "/v1/oauth/token"]);

function readOpenApiDocument() {
  return JSON.parse(readFileSync(OPENAPI_PATH, "utf8"));
}

function hasOAuthSecurity(operation) {
  if (!Array.isArray(operation?.security)) {
    return false;
  }

  return operation.security.some((entry) => {
    const scopes = entry?.oauth2;
    return Array.isArray(scopes) && scopes.length > 0;
  });
}

describe("auth metadata contract", () => {
  it("defines oauth2 security scheme", () => {
    const document = readOpenApiDocument();
    const scheme = document?.components?.securitySchemes?.oauth2;
    expect(scheme?.type).toBe("oauth2");
  });

  it("requires oauth2 metadata on protected endpoints", () => {
    const document = readOpenApiDocument();
    const paths = document?.paths ?? {};

    for (const [routePath, methods] of Object.entries(paths)) {
      for (const method of HTTP_METHODS) {
        const operation = methods?.[method];
        if (!operation) {
          continue;
        }

        if (PUBLIC_PATH_ALLOWLIST.has(routePath)) {
          expect(hasOAuthSecurity(operation)).toBe(false);
          continue;
        }

        expect(hasOAuthSecurity(operation)).toBe(true);
      }
    }
  });
});
