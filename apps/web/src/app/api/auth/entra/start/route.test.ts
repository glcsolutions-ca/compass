import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { OIDC_STATE_COOKIE_NAME } from "../../../../auth/sso-cookie";

describe("entra start route", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("WEB_SESSION_SECRET", "web-session-secret-123456");
    vi.stubEnv("WEB_BASE_URL", "http://localhost:3000");
    vi.stubEnv("ENTRA_LOGIN_ENABLED", "true");
    vi.stubEnv("ENTRA_CLIENT_ID", "web-client-id");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("builds authorization redirect and sets signed oidc state cookie", async () => {
    const request = new NextRequest("http://localhost:3000/api/auth/entra/start?next=%2Fworkspace");

    const response = await GET(request);
    expect(response.status).toBe(307);

    const location = response.headers.get("location");
    expect(location).toBeTruthy();
    const redirectUrl = new URL(location ?? "http://localhost");
    expect(redirectUrl.origin).toBe("https://login.microsoftonline.com");
    expect(redirectUrl.pathname).toBe("/organizations/oauth2/v2.0/authorize");
    expect(redirectUrl.searchParams.get("client_id")).toBe("web-client-id");
    expect(redirectUrl.searchParams.get("response_type")).toBe("code");
    expect(redirectUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(redirectUrl.searchParams.get("state")).toBeTruthy();
    expect(redirectUrl.searchParams.get("nonce")).toBeTruthy();

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain(`${OIDC_STATE_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("Max-Age=600");
  });

  it("returns 404 when entra login is disabled", async () => {
    vi.stubEnv("ENTRA_LOGIN_ENABLED", "false");

    const request = new NextRequest("http://localhost:3000/api/auth/entra/start");
    const response = await GET(request);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Microsoft Entra login is disabled",
      code: "ENTRA_LOGIN_DISABLED"
    });
  });

  it("returns 500 when web base URL host is 0.0.0.0", async () => {
    vi.stubEnv("WEB_BASE_URL", "http://0.0.0.0:3000");

    const request = new NextRequest("http://localhost:3000/api/auth/entra/start");
    const response = await GET(request);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "WEB_BASE_URL must not use 0.0.0.0; use localhost",
      code: "WEB_BASE_URL_INVALID"
    });
  });

  it("returns 500 when web base URL includes a path", async () => {
    vi.stubEnv("WEB_BASE_URL", "https://compass.example.com/app");

    const request = new NextRequest("http://localhost:3000/api/auth/entra/start");
    const response = await GET(request);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "WEB_BASE_URL must not include path, query, or fragment",
      code: "WEB_BASE_URL_INVALID"
    });
  });
});
