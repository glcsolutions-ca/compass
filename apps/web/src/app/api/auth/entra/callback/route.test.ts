import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import {
  createOidcStateCookieValue,
  OIDC_STATE_COOKIE_NAME,
  SSO_COOKIE_NAME
} from "../../../../auth/sso-cookie";

const SESSION_SECRET = "web-session-secret-123456";

function cookieHeader(value: string) {
  return `${OIDC_STATE_COOKIE_NAME}=${value}`;
}

function readLocation(response: Response) {
  const value = response.headers.get("location");
  return value ? new URL(value) : null;
}

function readRequestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

async function buildIdToken(input: { tid: string; nonce: string }) {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);

  const kid = "kid-test-1";
  const token = await new SignJWT({
    sub: "entra-user-1",
    tid: input.tid,
    nonce: input.nonce,
    preferred_username: "entra-user-1@example.com",
    name: "Entra User"
  })
    .setProtectedHeader({
      alg: "RS256",
      typ: "JWT",
      kid
    })
    .setIssuer(`https://login.microsoftonline.com/${input.tid}/v2.0`)
    .setAudience("web-client-id")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(privateKey);

  return {
    token,
    jwks: {
      keys: [
        {
          ...publicJwk,
          kid,
          use: "sig",
          alg: "RS256"
        }
      ]
    }
  };
}

describe("entra callback route", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("WEB_SESSION_SECRET", SESSION_SECRET);
    vi.stubEnv("ENTRA_LOGIN_ENABLED", "true");
    vi.stubEnv("ENTRA_CLIENT_ID", "web-client-id");
    vi.stubEnv("ENTRA_CLIENT_SECRET", "web-client-secret");
    vi.stubEnv("ENTRA_REDIRECT_URI", "http://localhost:3000/api/auth/entra/callback");
    vi.stubEnv("ENTRA_ALLOWED_TENANT_IDS", "tenant-a");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects callback when state does not match", async () => {
    const stateCookie = createOidcStateCookieValue({
      state: "expected-state",
      nonce: "expected-nonce",
      codeVerifier: "verifier-123",
      nextPath: "/",
      secret: SESSION_SECRET,
      nowMs: Date.now()
    });

    const request = new NextRequest(
      "http://localhost:3000/api/auth/entra/callback?code=abc&state=wrong-state",
      {
        headers: {
          cookie: cookieHeader(stateCookie)
        }
      }
    );

    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = readLocation(response);
    expect(location?.pathname).toBe("/login");
    expect(location?.searchParams.get("error")).toBe("state_mismatch");
  });

  it("rejects callback when tenant is not allowlisted", async () => {
    const stateCookie = createOidcStateCookieValue({
      state: "expected-state",
      nonce: "expected-nonce",
      codeVerifier: "verifier-123",
      nextPath: "/",
      secret: SESSION_SECRET,
      nowMs: Date.now()
    });
    const token = await buildIdToken({ tid: "tenant-b", nonce: "expected-nonce" });
    vi.stubEnv("ENTRA_JWKS_JSON", JSON.stringify(token.jwks));

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);
      if (url.includes("/token")) {
        return Response.json({
          token_type: "Bearer",
          expires_in: 3600,
          id_token: token.token
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest(
      "http://localhost:3000/api/auth/entra/callback?code=abc&state=expected-state",
      {
        headers: {
          cookie: cookieHeader(stateCookie)
        }
      }
    );

    const response = await GET(request);
    expect(response.status).toBe(307);
    const location = readLocation(response);
    expect(location?.pathname).toBe("/login");
    expect(location?.searchParams.get("error")).toBe("tenant_not_allowed");
  });

  it("sets enterprise session cookie on successful callback", async () => {
    const stateCookie = createOidcStateCookieValue({
      state: "expected-state",
      nonce: "expected-nonce",
      codeVerifier: "verifier-123",
      nextPath: "/workspace",
      secret: SESSION_SECRET,
      nowMs: Date.now()
    });
    const token = await buildIdToken({ tid: "tenant-a", nonce: "expected-nonce" });
    vi.stubEnv("ENTRA_JWKS_JSON", JSON.stringify(token.jwks));

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = readRequestUrl(input);
      if (url.includes("/token")) {
        return Response.json({
          token_type: "Bearer",
          expires_in: 3600,
          id_token: token.token
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest(
      "http://localhost:3000/api/auth/entra/callback?code=abc&state=expected-state",
      {
        headers: {
          cookie: cookieHeader(stateCookie)
        }
      }
    );

    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = readLocation(response);
    expect(location?.pathname).toBe("/workspace");

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SSO_COOKIE_NAME}=`);
    expect(setCookie).toContain(`${OIDC_STATE_COOKIE_NAME}=`);
    expect(setCookie).toContain("Max-Age=43200");
  });
});
