import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiForbiddenError,
  ApiUnauthorizedError,
  createApiClient,
  parseApiAuthErrorResponse
} from "./client.js";

describe("parseApiAuthErrorResponse", () => {
  it("maps 401 auth payloads to ApiUnauthorizedError", () => {
    const response = new Response(
      JSON.stringify({
        code: "invalid_token",
        message: "Token expired"
      }),
      { status: 401 }
    );

    const parsed = parseApiAuthErrorResponse(response, {
      code: "invalid_token",
      message: "Token expired"
    });

    expect(parsed).toBeInstanceOf(ApiUnauthorizedError);
  });

  it("maps 403 auth payloads to ApiForbiddenError", () => {
    const response = new Response(
      JSON.stringify({
        code: "tenant_denied",
        message: "Tenant is inactive"
      }),
      { status: 403 }
    );

    const parsed = parseApiAuthErrorResponse(response, {
      code: "tenant_denied",
      message: "Tenant is inactive"
    });

    expect(parsed).toBeInstanceOf(ApiForbiddenError);
  });
});

describe("createApiClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries once on 401 and throws typed auth error when enabled", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: "invalid_token",
            message: "Token expired"
          }),
          {
            status: 401,
            headers: {
              "www-authenticate": 'Bearer error="invalid_token"',
              "content-type": "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: "permission_denied",
            message: "Missing role"
          }),
          {
            status: 403,
            headers: {
              "content-type": "application/json"
            }
          }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = createApiClient({
      baseUrl: "http://localhost:3001",
      tokenProvider: async ({ reason }) => ({
        token: reason === "initial" ? "initial-token" : "refresh-token"
      }),
      throwOnAuthError: true
    });

    await expect(client.GET("/v1/me")).rejects.toBeInstanceOf(ApiForbiddenError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
