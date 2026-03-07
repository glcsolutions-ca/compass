import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignJWT, exportJWK, generateKeyPair, type JWK } from "jose";
import { EntraOidcClient } from "../../src/modules/auth/auth-service.js";

type JwtSignKey = Parameters<SignJWT["sign"]>[0];

interface TestKey {
  kid: string;
  privateKey: JwtSignKey;
  jwk: JWK;
}

interface JwksServer {
  authorityHost: string;
  setKeys: (keys: JWK[]) => void;
  close: () => Promise<void>;
}

async function createTestKey(kid: string): Promise<TestKey> {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);

  return {
    kid,
    privateKey,
    jwk: {
      ...publicJwk,
      kid,
      use: "sig",
      alg: "RS256"
    }
  };
}

async function startJwksServer(initialKeys: JWK[]): Promise<JwksServer> {
  let keys = [...initialKeys];

  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/organizations/discovery/v2.0/keys") {
      response.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store"
      });
      response.end(JSON.stringify({ keys }));
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ code: "NOT_FOUND" }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  const authorityHost = `http://127.0.0.1:${address.port}`;

  return {
    authorityHost,
    setKeys: (next) => {
      keys = [...next];
    },
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}

async function signIdToken(input: {
  privateKey: JwtSignKey;
  kid: string;
  authorityHost: string;
  audience: string;
  tid: string;
  oid: string;
  nonce: string;
  issuer?: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const issuer = input.issuer ?? `${input.authorityHost}/${input.tid}/v2.0`;
  const expiresInSeconds = input.expiresInSeconds ?? 300;

  return new SignJWT({
    tid: input.tid,
    oid: input.oid,
    nonce: input.nonce,
    email: "owner@acme.test",
    preferred_username: "owner@acme.test",
    name: "Owner User"
  })
    .setProtectedHeader({ alg: "RS256", kid: input.kid, typ: "JWT" })
    .setIssuer(issuer)
    .setAudience(input.audience)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + expiresInSeconds)
    .sign(input.privateKey);
}

describe("EntraOidcClient.verifyIdToken", () => {
  const createdServers: JwksServer[] = [];

  afterEach(async () => {
    while (createdServers.length > 0) {
      const server = createdServers.pop();
      if (server) {
        await server.close();
      }
    }
  });

  it("accepts a valid ID token", async () => {
    const key = await createTestKey("k1");
    const jwksServer = await startJwksServer([key.jwk]);
    createdServers.push(jwksServer);

    const client = new EntraOidcClient({
      authorityHost: jwksServer.authorityHost,
      tenantSegment: "organizations",
      clientId: "compass-client-id",
      clientSecret: "compass-client-secret",
      jwksOptions: { cooldownDuration: 0 }
    });

    const token = await signIdToken({
      privateKey: key.privateKey,
      kid: key.kid,
      authorityHost: jwksServer.authorityHost,
      audience: "compass-client-id",
      tid: "11111111-1111-1111-1111-111111111111",
      oid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      nonce: "nonce-1"
    });

    const claims = await client.verifyIdToken({
      idToken: token,
      expectedNonce: "nonce-1"
    });

    expect(claims.tid).toBe("11111111-1111-1111-1111-111111111111");
    expect(claims.oid).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  });

  it("rejects wrong audience", async () => {
    const key = await createTestKey("k1");
    const jwksServer = await startJwksServer([key.jwk]);
    createdServers.push(jwksServer);

    const client = new EntraOidcClient({
      authorityHost: jwksServer.authorityHost,
      tenantSegment: "organizations",
      clientId: "compass-client-id",
      clientSecret: "compass-client-secret",
      jwksOptions: { cooldownDuration: 0 }
    });

    const token = await signIdToken({
      privateKey: key.privateKey,
      kid: key.kid,
      authorityHost: jwksServer.authorityHost,
      audience: "different-client-id",
      tid: "11111111-1111-1111-1111-111111111111",
      oid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      nonce: "nonce-1"
    });

    await expect(
      client.verifyIdToken({
        idToken: token,
        expectedNonce: "nonce-1"
      })
    ).rejects.toMatchObject({
      code: "OIDC_TOKEN_INVALID"
    });
  });

  it("rejects expired tokens", async () => {
    const key = await createTestKey("k1");
    const jwksServer = await startJwksServer([key.jwk]);
    createdServers.push(jwksServer);

    const client = new EntraOidcClient({
      authorityHost: jwksServer.authorityHost,
      tenantSegment: "organizations",
      clientId: "compass-client-id",
      clientSecret: "compass-client-secret",
      jwksOptions: { cooldownDuration: 0 }
    });

    const token = await signIdToken({
      privateKey: key.privateKey,
      kid: key.kid,
      authorityHost: jwksServer.authorityHost,
      audience: "compass-client-id",
      tid: "11111111-1111-1111-1111-111111111111",
      oid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      nonce: "nonce-1",
      expiresInSeconds: -60
    });

    await expect(
      client.verifyIdToken({
        idToken: token,
        expectedNonce: "nonce-1"
      })
    ).rejects.toMatchObject({
      code: "OIDC_TOKEN_INVALID"
    });
  });

  it("rejects invalid signatures", async () => {
    const trustedKey = await createTestKey("trusted");
    const signerKey = await createTestKey("untrusted");
    const jwksServer = await startJwksServer([trustedKey.jwk]);
    createdServers.push(jwksServer);

    const client = new EntraOidcClient({
      authorityHost: jwksServer.authorityHost,
      tenantSegment: "organizations",
      clientId: "compass-client-id",
      clientSecret: "compass-client-secret",
      jwksOptions: { cooldownDuration: 0 }
    });

    const token = await signIdToken({
      privateKey: signerKey.privateKey,
      kid: trustedKey.kid,
      authorityHost: jwksServer.authorityHost,
      audience: "compass-client-id",
      tid: "11111111-1111-1111-1111-111111111111",
      oid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      nonce: "nonce-1"
    });

    await expect(
      client.verifyIdToken({
        idToken: token,
        expectedNonce: "nonce-1"
      })
    ).rejects.toMatchObject({
      code: "OIDC_TOKEN_INVALID"
    });
  });

  it("supports JWKS key rollover", async () => {
    const key1 = await createTestKey("k1");
    const key2 = await createTestKey("k2");
    const jwksServer = await startJwksServer([key1.jwk]);
    createdServers.push(jwksServer);

    const client = new EntraOidcClient({
      authorityHost: jwksServer.authorityHost,
      tenantSegment: "organizations",
      clientId: "compass-client-id",
      clientSecret: "compass-client-secret",
      jwksOptions: { cooldownDuration: 0 }
    });

    const token1 = await signIdToken({
      privateKey: key1.privateKey,
      kid: key1.kid,
      authorityHost: jwksServer.authorityHost,
      audience: "compass-client-id",
      tid: "11111111-1111-1111-1111-111111111111",
      oid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      nonce: "nonce-1"
    });

    await expect(
      client.verifyIdToken({
        idToken: token1,
        expectedNonce: "nonce-1"
      })
    ).resolves.toBeTruthy();

    jwksServer.setKeys([key2.jwk]);

    const token2 = await signIdToken({
      privateKey: key2.privateKey,
      kid: key2.kid,
      authorityHost: jwksServer.authorityHost,
      audience: "compass-client-id",
      tid: "11111111-1111-1111-1111-111111111111",
      oid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      nonce: "nonce-2"
    });

    await expect(
      client.verifyIdToken({
        idToken: token2,
        expectedNonce: "nonce-2"
      })
    ).resolves.toBeTruthy();
  });

  it("rejects issuer mismatch", async () => {
    const key = await createTestKey("k1");
    const jwksServer = await startJwksServer([key.jwk]);
    createdServers.push(jwksServer);

    const client = new EntraOidcClient({
      authorityHost: jwksServer.authorityHost,
      tenantSegment: "organizations",
      clientId: "compass-client-id",
      clientSecret: "compass-client-secret",
      jwksOptions: { cooldownDuration: 0 }
    });

    const token = await signIdToken({
      privateKey: key.privateKey,
      kid: key.kid,
      authorityHost: jwksServer.authorityHost,
      audience: "compass-client-id",
      tid: "11111111-1111-1111-1111-111111111111",
      oid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      nonce: "nonce-1",
      issuer: "https://malicious.example/11111111-1111-1111-1111-111111111111/v2.0"
    });

    await expect(
      client.verifyIdToken({
        idToken: token,
        expectedNonce: "nonce-1"
      })
    ).rejects.toMatchObject({
      code: "OIDC_TOKEN_INVALID",
      message: "ID token issuer is invalid"
    });
  });

  it("rejects nonce mismatch and missing required claims", async () => {
    const key = await createTestKey("k1");
    const jwksServer = await startJwksServer([key.jwk]);
    createdServers.push(jwksServer);

    const client = new EntraOidcClient({
      authorityHost: jwksServer.authorityHost,
      tenantSegment: "organizations",
      clientId: "compass-client-id",
      clientSecret: "compass-client-secret",
      jwksOptions: { cooldownDuration: 0 }
    });

    const nonceMismatchToken = await signIdToken({
      privateKey: key.privateKey,
      kid: key.kid,
      authorityHost: jwksServer.authorityHost,
      audience: "compass-client-id",
      tid: "11111111-1111-1111-1111-111111111111",
      oid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      nonce: "nonce-actual"
    });
    await expect(
      client.verifyIdToken({
        idToken: nonceMismatchToken,
        expectedNonce: "nonce-expected"
      })
    ).rejects.toMatchObject({
      code: "OIDC_TOKEN_INVALID",
      message: "ID token nonce mismatch"
    });

    const nowSeconds = Math.floor(Date.now() / 1000);
    const missingClaimsToken = await new SignJWT({
      tid: "11111111-1111-1111-1111-111111111111",
      nonce: "nonce-1"
    })
      .setProtectedHeader({ alg: "RS256", kid: key.kid, typ: "JWT" })
      .setIssuer(`${jwksServer.authorityHost}/11111111-1111-1111-1111-111111111111/v2.0`)
      .setAudience("compass-client-id")
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + 300)
      .sign(key.privateKey);

    await expect(
      client.verifyIdToken({
        idToken: missingClaimsToken,
        expectedNonce: "nonce-1"
      })
    ).rejects.toMatchObject({
      code: "OIDC_TOKEN_INVALID",
      message: "ID token missing required claims"
    });
  });
});

describe("EntraOidcClient request/response flows", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it("builds authorize and admin-consent URLs with expected parameters", () => {
    const client = new EntraOidcClient({
      authorityHost: "https://login.microsoftonline.com",
      tenantSegment: "organizations",
      clientId: "client-id",
      clientSecret: "client-secret"
    });

    const authorizeUrl = new URL(
      client.buildAuthorizeUrl({
        state: "state-1",
        nonce: "nonce-1",
        codeChallenge: "challenge-1",
        redirectUri: "https://app.example.com/v1/auth/entra/callback"
      })
    );
    expect(authorizeUrl.pathname).toBe("/organizations/oauth2/v2.0/authorize");
    expect(authorizeUrl.searchParams.get("client_id")).toBe("client-id");
    expect(authorizeUrl.searchParams.get("state")).toBe("state-1");
    expect(authorizeUrl.searchParams.get("nonce")).toBe("nonce-1");
    expect(authorizeUrl.searchParams.get("code_challenge")).toBe("challenge-1");
    expect(authorizeUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizeUrl.searchParams.get("prompt")).toBe("select_account");

    const hintedConsentUrl = new URL(
      client.buildAdminConsentUrl({
        tenantHint: "contoso.onmicrosoft.com",
        redirectUri: "https://app.example.com/v1/auth/entra/callback",
        state: "consent-state"
      })
    );
    expect(hintedConsentUrl.pathname).toBe("/contoso.onmicrosoft.com/v2.0/adminconsent");
    expect(hintedConsentUrl.searchParams.get("client_id")).toBe("client-id");
    expect(hintedConsentUrl.searchParams.get("state")).toBe("consent-state");

    const defaultConsentUrl = new URL(
      client.buildAdminConsentUrl({
        redirectUri: "https://app.example.com/v1/auth/entra/callback",
        state: "default-consent"
      })
    );
    expect(defaultConsentUrl.pathname).toBe("/organizations/v2.0/adminconsent");
  });

  it("exchanges code for token and surfaces endpoint failures", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id_token: "id-token-1" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description: "Code verifier rejected"
          }),
          {
            status: 401,
            headers: { "content-type": "application/json" }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "invalid_grant" }), {
          status: 401,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id_token: null }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    globalThis.fetch = fetchMock;

    const client = new EntraOidcClient({
      authorityHost: "https://login.microsoftonline.com",
      tenantSegment: "organizations",
      clientId: "client-id",
      clientSecret: "client-secret"
    });

    await expect(
      client.exchangeCodeForIdToken({
        code: "code-1",
        redirectUri: "https://app.example.com/v1/auth/entra/callback",
        codeVerifier: "verifier-1"
      })
    ).resolves.toBe("id-token-1");

    await expect(
      client.exchangeCodeForIdToken({
        code: "code-2",
        redirectUri: "https://app.example.com/v1/auth/entra/callback",
        codeVerifier: "verifier-2"
      })
    ).rejects.toMatchObject({
      code: "OIDC_TOKEN_EXCHANGE_FAILED",
      message: "Code verifier rejected"
    });

    await expect(
      client.exchangeCodeForIdToken({
        code: "code-3",
        redirectUri: "https://app.example.com/v1/auth/entra/callback",
        codeVerifier: "verifier-3"
      })
    ).rejects.toMatchObject({
      code: "OIDC_TOKEN_EXCHANGE_FAILED",
      message: "invalid_grant"
    });

    await expect(
      client.exchangeCodeForIdToken({
        code: "code-4",
        redirectUri: "https://app.example.com/v1/auth/entra/callback",
        codeVerifier: "verifier-4"
      })
    ).rejects.toMatchObject({
      code: "OIDC_TOKEN_EXCHANGE_FAILED",
      message: "Token endpoint failed with 401"
    });

    await expect(
      client.exchangeCodeForIdToken({
        code: "code-5",
        redirectUri: "https://app.example.com/v1/auth/entra/callback",
        codeVerifier: "verifier-5"
      })
    ).rejects.toMatchObject({
      code: "OIDC_TOKEN_EXCHANGE_FAILED",
      message: "Token endpoint did not return id_token"
    });
  });
});
