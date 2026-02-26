import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { SignJWT, exportJWK, generateKeyPair, type JWK } from "jose";
import { EntraOidcClient } from "./auth-service.js";

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
});
