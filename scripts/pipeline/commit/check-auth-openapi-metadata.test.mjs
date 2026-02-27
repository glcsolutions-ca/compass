import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const OPENAPI_PATH = "packages/contracts/openapi/openapi.json";

function readOpenApiDocument() {
  return JSON.parse(readFileSync(OPENAPI_PATH, "utf8"));
}

describe("openapi auth metadata contract", () => {
  it("includes baseline system routes", () => {
    const document = readOpenApiDocument();
    expect(document?.paths?.["/health"]).toBeTruthy();
    expect(document?.paths?.["/v1/ping"]).toBeTruthy();
  });

  it("includes cookie-based security metadata for protected routes", () => {
    const document = readOpenApiDocument();
    expect(document?.components?.securitySchemes?.sessionCookieAuth).toEqual({
      type: "apiKey",
      in: "cookie",
      name: "__Host-compass_session",
      description: "Opaque server-side session cookie"
    });

    expect(document?.paths?.["/v1/auth/me"]?.get?.security).toEqual([{ sessionCookieAuth: [] }]);
    expect(document?.paths?.["/v1/auth/logout"]?.post?.security).toEqual([
      { sessionCookieAuth: [] }
    ]);
    expect(document?.paths?.["/v1/workspaces"]?.post?.security).toEqual([
      { sessionCookieAuth: [] }
    ]);
    expect(document?.paths?.["/v1/workspaces/{workspaceSlug}"]?.get?.security).toEqual([
      { sessionCookieAuth: [] }
    ]);
    expect(document?.paths?.["/v1/workspaces/{workspaceSlug}/members"]?.get?.security).toEqual([
      { sessionCookieAuth: [] }
    ]);
    expect(document?.paths?.["/v1/workspaces/{workspaceSlug}/invites"]?.post?.security).toEqual([
      { sessionCookieAuth: [] }
    ]);
    expect(
      document?.paths?.["/v1/workspaces/{workspaceSlug}/invites/{token}/accept"]?.post?.security
    ).toEqual([{ sessionCookieAuth: [] }]);
  });
});
