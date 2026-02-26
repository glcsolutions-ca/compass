import path from "node:path";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Client } from "pg";
import {
  ApiError,
  AuthRepository,
  AuthService,
  type EntraAuthConfig,
  type OidcClient,
  type OidcIdTokenClaims
} from "../../src/auth-service.js";
import { buildApiApp } from "../../src/app.js";

const FIXED_NOW = new Date("2026-02-26T17:00:00.000Z");
const SAME_ORIGIN = "http://localhost:3000";

class FakeOidcClient implements OidcClient {
  private readonly claimsByCode: Record<string, OidcIdTokenClaims>;
  private readonly forceNonceMismatch: boolean;

  constructor(input: {
    claimsByCode: Record<string, OidcIdTokenClaims>;
    forceNonceMismatch?: boolean;
  }) {
    this.claimsByCode = input.claimsByCode;
    this.forceNonceMismatch = Boolean(input.forceNonceMismatch);
  }

  buildAuthorizeUrl(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
    redirectUri: string;
  }): string {
    const url = new URL("https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize");
    url.searchParams.set("state", input.state);
    url.searchParams.set("nonce", input.nonce);
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("redirect_uri", input.redirectUri);
    return url.toString();
  }

  buildAdminConsentUrl(input: { tenantHint?: string; redirectUri: string; state: string }): string {
    const tenantHint = input.tenantHint ?? "organizations";
    const url = new URL(`https://login.microsoftonline.com/${tenantHint}/v2.0/adminconsent`);
    url.searchParams.set("state", input.state);
    url.searchParams.set("redirect_uri", input.redirectUri);
    return url.toString();
  }

  async exchangeCodeForIdToken(input: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<string> {
    if (!this.claimsByCode[input.code]) {
      throw new ApiError(401, "OIDC_TOKEN_EXCHANGE_FAILED", "Unknown authorization code");
    }

    return input.code;
  }

  async verifyIdToken(input: {
    idToken: string;
    expectedNonce: string;
  }): Promise<OidcIdTokenClaims> {
    if (this.forceNonceMismatch) {
      throw new ApiError(401, "OIDC_TOKEN_INVALID", "ID token nonce mismatch");
    }

    const claims = this.claimsByCode[input.idToken];
    if (!claims) {
      throw new ApiError(401, "OIDC_TOKEN_INVALID", "Unknown ID token");
    }

    if (!input.expectedNonce) {
      throw new ApiError(401, "OIDC_TOKEN_INVALID", "Expected nonce is missing");
    }

    return claims;
  }
}

function buildConfig(): EntraAuthConfig {
  return {
    enabled: true,
    clientId: "compass-client-id",
    clientSecret: "compass-client-secret",
    oidcStateEncryptionKey: Buffer.from("12345678901234567890123456789012", "utf8").toString(
      "base64url"
    ),
    redirectUri: "https://compass.glcsolutions.ca/v1/auth/entra/callback",
    authorityHost: "https://login.microsoftonline.com",
    tenantSegment: "organizations",
    allowedTenantIds: [],
    scope: "openid profile email",
    webBaseUrl: "https://compass.glcsolutions.ca",
    sessionTtlSeconds: 60 * 60 * 8,
    sessionIdleTtlSeconds: 60 * 60
  };
}

function buildClaims(tid: string, oid: string, email: string, name: string): OidcIdTokenClaims {
  return {
    tid,
    oid,
    iss: `https://login.microsoftonline.com/${tid}/v2.0`,
    email,
    upn: email,
    name
  };
}

function parseRedirectLocation(locationHeader: string): URL {
  return new URL(locationHeader);
}

function extractCookie(setCookieHeader: string[] | string | undefined): string {
  const asArray = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];

  const sessionCookie = asArray.find((value) => value.startsWith("__Host-compass_session="));
  if (!sessionCookie) {
    throw new Error("Expected __Host-compass_session cookie");
  }

  return sessionCookie.split(";")[0];
}

function resolveIntegrationDatabaseUrl(repoRootPath: string): string {
  const explicit = process.env.DATABASE_URL?.trim();
  if (explicit) {
    return explicit;
  }

  const envPath = path.join(repoRootPath, "db/postgres/.env");
  const content = readFileSync(envPath, "utf8");
  const lines = content.split(/\r?\n/u);
  const values = new Map<string, string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u);
    if (!match) {
      continue;
    }

    values.set(match[1], match[2].trim());
  }

  const fromFile = values.get("DATABASE_URL")?.trim();
  if (fromFile) {
    return fromFile;
  }

  const port = values.get("POSTGRES_PORT")?.trim() || "5432";
  return `postgres://compass:compass@localhost:${port}/compass`;
}

function extractInviteToken(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invite payload is not an object");
  }

  const token = (payload as { token?: unknown }).token;
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("Invite token is missing");
  }

  return token;
}

function parseAppRedirect(location: string): URL {
  return new URL(location, "https://compass.glcsolutions.ca");
}

const repoRoot = path.resolve(import.meta.dirname, "../../../../");
const databaseUrl = resolveIntegrationDatabaseUrl(repoRoot);

describe("API auth integration", () => {
  const repository = new AuthRepository(databaseUrl);

  beforeAll(async () => {
    await repository.listMemberships("non-existent-user");
  });

  afterAll(async () => {
    await repository.close();
  });

  beforeEach(async () => {
    await repository.clearAuthData();
  });

  it("supports login, me, tenant create, and invite acceptance", async () => {
    const claimsByCode = {
      "code-user-1": buildClaims(
        "11111111-1111-1111-1111-111111111111",
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "owner@acme.test",
        "Owner User"
      ),
      "code-user-2": buildClaims(
        "11111111-1111-1111-1111-111111111111",
        "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        "member@acme.test",
        "Member User"
      )
    };

    const authService = new AuthService({
      config: buildConfig(),
      repository,
      oidcClient: new FakeOidcClient({ claimsByCode })
    });

    const app = buildApiApp({
      now: () => new Date(FIXED_NOW),
      authService
    });

    const start = await request(app).get(
      "/v1/auth/entra/start?returnTo=%2Ft%2Facme%2Fprojects%2F123"
    );
    expect(start.status).toBe(302);

    const startLocation = parseRedirectLocation(start.headers.location);
    const state = startLocation.searchParams.get("state");
    expect(state).toBeTruthy();

    const callbackOwner = await request(app).get(
      `/v1/auth/entra/callback?code=code-user-1&state=${encodeURIComponent(String(state))}`
    );
    expect(callbackOwner.status).toBe(302);
    expect(callbackOwner.headers.location).toBe("/workspaces?onboarding=1");

    const ownerCookie = extractCookie(callbackOwner.headers["set-cookie"]);

    const meBeforeTenant = await request(app).get("/v1/auth/me").set("Cookie", ownerCookie);
    expect(meBeforeTenant.status).toBe(200);
    expect(meBeforeTenant.body.authenticated).toBe(true);
    expect(meBeforeTenant.body.memberships).toEqual([]);

    const createTenant = await request(app)
      .post("/v1/tenants")
      .set("Cookie", ownerCookie)
      .set("origin", SAME_ORIGIN)
      .send({
        slug: "acme",
        name: "Acme Corp"
      });
    expect(createTenant.status).toBe(201);
    expect(createTenant.body).toMatchObject({
      tenant: {
        slug: "acme",
        name: "Acme Corp",
        status: "active"
      },
      membership: {
        role: "owner",
        status: "active"
      }
    });

    const meAfterTenant = await request(app).get("/v1/auth/me").set("Cookie", ownerCookie);
    expect(meAfterTenant.status).toBe(200);
    expect(meAfterTenant.body.memberships).toHaveLength(1);
    expect(meAfterTenant.body.memberships[0].tenantSlug).toBe("acme");

    const getTenant = await request(app).get("/v1/tenants/acme").set("Cookie", ownerCookie);
    expect(getTenant.status).toBe(200);
    expect(getTenant.body.tenant.slug).toBe("acme");

    const listMembersBefore = await request(app)
      .get("/v1/tenants/acme/members")
      .set("Cookie", ownerCookie);
    expect(listMembersBefore.status).toBe(200);
    expect(listMembersBefore.body.members).toHaveLength(1);

    const createInvite = await request(app)
      .post("/v1/tenants/acme/invites")
      .set("Cookie", ownerCookie)
      .set("origin", SAME_ORIGIN)
      .send({
        email: "member@acme.test",
        role: "member"
      });
    expect(createInvite.status).toBe(201);
    expect(createInvite.body.inviteId).toBeTruthy();
    expect(createInvite.body.token).toBeTruthy();
    const inviteToken = extractInviteToken(createInvite.body);

    const startMember = await request(app).get("/v1/auth/entra/start");
    expect(startMember.status).toBe(302);
    const memberState = parseRedirectLocation(startMember.headers.location).searchParams.get(
      "state"
    );

    const callbackMember = await request(app).get(
      `/v1/auth/entra/callback?code=code-user-2&state=${encodeURIComponent(String(memberState))}`
    );
    expect(callbackMember.status).toBe(302);
    const memberCookie = extractCookie(callbackMember.headers["set-cookie"]);

    const acceptInvite = await request(app)
      .post(`/v1/tenants/acme/invites/${encodeURIComponent(inviteToken)}/accept`)
      .set("Cookie", memberCookie)
      .set("origin", SAME_ORIGIN);

    expect(acceptInvite.status).toBe(200);
    expect(acceptInvite.body).toMatchObject({
      joined: true,
      tenantSlug: "acme",
      role: "member",
      status: "active"
    });

    const listMembersAfter = await request(app)
      .get("/v1/tenants/acme/members")
      .set("Cookie", ownerCookie);
    expect(listMembersAfter.status).toBe(200);
    expect(listMembersAfter.body.members).toHaveLength(2);
  });

  it("rejects callback state mismatch", async () => {
    const authService = new AuthService({
      config: buildConfig(),
      repository,
      oidcClient: new FakeOidcClient({
        claimsByCode: {
          "code-user-1": buildClaims(
            "11111111-1111-1111-1111-111111111111",
            "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            "owner@acme.test",
            "Owner User"
          )
        }
      })
    });

    const app = buildApiApp({ authService, now: () => new Date(FIXED_NOW) });

    const callback = await request(app).get(
      "/v1/auth/entra/callback?code=code-user-1&state=bad-state"
    );

    expect(callback.status).toBe(401);
    expect(callback.body).toEqual({
      code: "STATE_INVALID",
      message: "OIDC state is invalid or expired"
    });
  });

  it("rejects replayed login callback state", async () => {
    const authService = new AuthService({
      config: buildConfig(),
      repository,
      oidcClient: new FakeOidcClient({
        claimsByCode: {
          "code-user-1": buildClaims(
            "11111111-1111-1111-1111-111111111111",
            "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            "owner@acme.test",
            "Owner User"
          )
        }
      })
    });

    const app = buildApiApp({ authService, now: () => new Date(FIXED_NOW) });

    const start = await request(app).get("/v1/auth/entra/start");
    const state = parseRedirectLocation(start.headers.location).searchParams.get("state");
    expect(state).toBeTruthy();

    const firstCallback = await request(app).get(
      `/v1/auth/entra/callback?code=code-user-1&state=${encodeURIComponent(String(state))}`
    );
    expect(firstCallback.status).toBe(302);

    const replay = await request(app).get(
      `/v1/auth/entra/callback?code=code-user-1&state=${encodeURIComponent(String(state))}`
    );
    expect(replay.status).toBe(401);
    expect(replay.body).toEqual({
      code: "STATE_INVALID",
      message: "OIDC state is invalid or expired"
    });
  });

  it("redirects to login guidance when admin consent is required", async () => {
    const authService = new AuthService({
      config: buildConfig(),
      repository,
      oidcClient: new FakeOidcClient({
        claimsByCode: {}
      })
    });

    const app = buildApiApp({ authService, now: () => new Date(FIXED_NOW) });

    const callback = await request(app).get(
      "/v1/auth/entra/callback?error=access_denied&error_description=AADSTS65001%3A%20Consent%20required"
    );

    expect(callback.status).toBe(302);
    const callbackLocation = parseAppRedirect(String(callback.headers.location));
    expect(callbackLocation.pathname).toBe("/login");
    expect(callbackLocation.searchParams.get("error")).toBe("admin_consent_required");
    expect(callbackLocation.searchParams.get("returnTo")).toBe("/");
  });

  it("preserves state-derived returnTo when consent is required during login callback", async () => {
    const authService = new AuthService({
      config: buildConfig(),
      repository,
      oidcClient: new FakeOidcClient({
        claimsByCode: {}
      })
    });

    const app = buildApiApp({ authService, now: () => new Date(FIXED_NOW) });
    const start = await request(app).get(
      "/v1/auth/entra/start?returnTo=%2Ft%2Facme%2Fprojects%2F123"
    );
    expect(start.status).toBe(302);
    const state = parseRedirectLocation(start.headers.location).searchParams.get("state");
    expect(state).toBeTruthy();

    const callback = await request(app).get(
      `/v1/auth/entra/callback?error=access_denied&error_description=AADSTS65001%3A%20Consent%20required&state=${encodeURIComponent(
        String(state)
      )}`
    );

    expect(callback.status).toBe(302);
    const callbackLocation = parseAppRedirect(String(callback.headers.location));
    expect(callbackLocation.pathname).toBe("/login");
    expect(callbackLocation.searchParams.get("error")).toBe("admin_consent_required");
    expect(callbackLocation.searchParams.get("returnTo")).toBe("/t/acme/projects/123");
  });

  it("fails closed when Entra login is enabled without OIDC state encryption key", async () => {
    const config = buildConfig();
    delete config.oidcStateEncryptionKey;

    const authService = new AuthService({
      config,
      repository,
      oidcClient: new FakeOidcClient({
        claimsByCode: {}
      })
    });

    const app = buildApiApp({ authService, now: () => new Date(FIXED_NOW) });
    const start = await request(app).get("/v1/auth/entra/start");

    expect(start.status).toBe(503);
    expect(start.body).toEqual({
      code: "ENTRA_CONFIG_REQUIRED",
      message: "AUTH_OIDC_STATE_ENCRYPTION_KEY is required when Entra login is enabled"
    });
  });

  it("handles admin consent success callback and rejects replayed admin-consent state", async () => {
    const authService = new AuthService({
      config: buildConfig(),
      repository,
      oidcClient: new FakeOidcClient({
        claimsByCode: {}
      })
    });

    const app = buildApiApp({ authService, now: () => new Date(FIXED_NOW) });

    const start = await request(app).get(
      "/v1/auth/entra/admin-consent/start?tenantHint=contoso.onmicrosoft.com&returnTo=%2Ft%2Facme"
    );
    expect(start.status).toBe(302);
    const startLocation = parseRedirectLocation(start.headers.location);
    const state = startLocation.searchParams.get("state");
    expect(state).toBeTruthy();

    const callback = await request(app).get(
      `/v1/auth/entra/callback?admin_consent=True&tenant=11111111-1111-1111-1111-111111111111&state=${encodeURIComponent(String(state))}`
    );

    expect(callback.status).toBe(302);
    const callbackLocation = parseAppRedirect(String(callback.headers.location));
    expect(callbackLocation.pathname).toBe("/login");
    expect(callbackLocation.searchParams.get("consent")).toBe("granted");
    expect(callbackLocation.searchParams.get("returnTo")).toBe("/t/acme");
    expect(callbackLocation.searchParams.get("tenantHint")).toBe(
      "11111111-1111-1111-1111-111111111111"
    );
    expect(callback.headers["set-cookie"]).toBeUndefined();

    const replay = await request(app).get(
      `/v1/auth/entra/callback?admin_consent=True&tenant=11111111-1111-1111-1111-111111111111&state=${encodeURIComponent(String(state))}`
    );
    expect(replay.status).toBe(401);
    expect(replay.body).toEqual({
      code: "STATE_INVALID",
      message: "OIDC state is invalid or expired"
    });
  });

  it("handles admin consent denial callback with actionable login redirect", async () => {
    const authService = new AuthService({
      config: buildConfig(),
      repository,
      oidcClient: new FakeOidcClient({
        claimsByCode: {}
      })
    });

    const app = buildApiApp({ authService, now: () => new Date(FIXED_NOW) });

    const start = await request(app).get(
      "/v1/auth/entra/admin-consent/start?tenantHint=contoso.onmicrosoft.com&returnTo=%2Ft%2Facme%2Fprojects%2F123"
    );
    expect(start.status).toBe(302);
    const startLocation = parseRedirectLocation(start.headers.location);
    const state = startLocation.searchParams.get("state");
    expect(state).toBeTruthy();

    const callback = await request(app).get(
      `/v1/auth/entra/callback?error=access_denied&error_description=Permission%20denied&state=${encodeURIComponent(String(state))}&tenant=contoso.onmicrosoft.com`
    );

    expect(callback.status).toBe(302);
    const callbackLocation = parseAppRedirect(String(callback.headers.location));
    expect(callbackLocation.pathname).toBe("/login");
    expect(callbackLocation.searchParams.get("consent")).toBe("denied");
    expect(callbackLocation.searchParams.get("returnTo")).toBe("/t/acme/projects/123");
    expect(callbackLocation.searchParams.get("tenantHint")).toBe("contoso.onmicrosoft.com");
  });

  it("rejects tenant read without session", async () => {
    const authService = new AuthService({
      config: buildConfig(),
      repository,
      oidcClient: new FakeOidcClient({
        claimsByCode: {}
      })
    });

    const app = buildApiApp({ authService, now: () => new Date(FIXED_NOW) });

    const response = await request(app).get("/v1/tenants/acme");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHORIZED");
  });

  it("rejects invite creation by non-admin member", async () => {
    const claimsByCode = {
      "code-owner": buildClaims(
        "11111111-1111-1111-1111-111111111111",
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "owner@acme.test",
        "Owner User"
      ),
      "code-member": buildClaims(
        "11111111-1111-1111-1111-111111111111",
        "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        "member@acme.test",
        "Member User"
      )
    };

    const authService = new AuthService({
      config: buildConfig(),
      repository,
      oidcClient: new FakeOidcClient({ claimsByCode })
    });

    const app = buildApiApp({
      now: () => new Date(FIXED_NOW),
      authService
    });

    const ownerStart = await request(app).get("/v1/auth/entra/start");
    const ownerState = parseRedirectLocation(ownerStart.headers.location).searchParams.get("state");
    const ownerCallback = await request(app).get(
      `/v1/auth/entra/callback?code=code-owner&state=${encodeURIComponent(String(ownerState))}`
    );
    const ownerCookie = extractCookie(ownerCallback.headers["set-cookie"]);

    const createTenant = await request(app)
      .post("/v1/tenants")
      .set("Cookie", ownerCookie)
      .set("origin", SAME_ORIGIN)
      .send({
        slug: "acme",
        name: "Acme Corp"
      });
    expect(createTenant.status).toBe(201);

    const memberStart = await request(app).get("/v1/auth/entra/start");
    const memberState = parseRedirectLocation(memberStart.headers.location).searchParams.get(
      "state"
    );
    const memberCallback = await request(app).get(
      `/v1/auth/entra/callback?code=code-member&state=${encodeURIComponent(String(memberState))}`
    );
    const memberCookie = extractCookie(memberCallback.headers["set-cookie"]);

    const invite = await request(app)
      .post("/v1/tenants/acme/invites")
      .set("Cookie", ownerCookie)
      .set("origin", SAME_ORIGIN)
      .send({
        email: "member@acme.test",
        role: "member"
      });
    const inviteToken = extractInviteToken(invite.body);

    const accept = await request(app)
      .post(`/v1/tenants/acme/invites/${encodeURIComponent(inviteToken)}/accept`)
      .set("Cookie", memberCookie)
      .set("origin", SAME_ORIGIN);
    expect(accept.status).toBe(200);

    const forbiddenInvite = await request(app)
      .post("/v1/tenants/acme/invites")
      .set("Cookie", memberCookie)
      .set("origin", SAME_ORIGIN)
      .send({
        email: "other@acme.test",
        role: "viewer"
      });

    expect(forbiddenInvite.status).toBe(403);
    expect(forbiddenInvite.body.code).toBe("INVITE_FORBIDDEN");
  });

  it("rejects callback when nonce verification fails", async () => {
    const authService = new AuthService({
      config: buildConfig(),
      repository,
      oidcClient: new FakeOidcClient({
        claimsByCode: {
          "code-user-1": buildClaims(
            "11111111-1111-1111-1111-111111111111",
            "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            "owner@acme.test",
            "Owner User"
          )
        },
        forceNonceMismatch: true
      })
    });

    const app = buildApiApp({ authService, now: () => new Date(FIXED_NOW) });

    const start = await request(app).get("/v1/auth/entra/start");
    const state = parseRedirectLocation(start.headers.location).searchParams.get("state");

    const callback = await request(app).get(
      `/v1/auth/entra/callback?code=code-user-1&state=${encodeURIComponent(String(state))}`
    );

    expect(callback.status).toBe(401);
    expect(callback.body.code).toBe("OIDC_TOKEN_INVALID");
  });

  it("enforces Entra tenant allow-listing", async () => {
    const config = buildConfig();
    config.allowedTenantIds = ["22222222-2222-2222-2222-222222222222"];

    const authService = new AuthService({
      config,
      repository,
      oidcClient: new FakeOidcClient({
        claimsByCode: {
          "code-user-1": buildClaims(
            "11111111-1111-1111-1111-111111111111",
            "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            "owner@acme.test",
            "Owner User"
          )
        }
      })
    });

    const app = buildApiApp({ authService, now: () => new Date(FIXED_NOW) });
    const start = await request(app).get("/v1/auth/entra/start");
    const state = parseRedirectLocation(start.headers.location).searchParams.get("state");

    const callback = await request(app).get(
      `/v1/auth/entra/callback?code=code-user-1&state=${encodeURIComponent(String(state))}`
    );

    expect(callback.status).toBe(403);
    expect(callback.body).toEqual({
      code: "ENTRA_TENANT_NOT_ALLOWED",
      message: "Your Microsoft Entra tenant is not allowed to sign in"
    });
  });

  it("revokes session on logout", async () => {
    const authService = new AuthService({
      config: buildConfig(),
      repository,
      oidcClient: new FakeOidcClient({
        claimsByCode: {
          "code-user-1": buildClaims(
            "11111111-1111-1111-1111-111111111111",
            "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            "owner@acme.test",
            "Owner User"
          )
        }
      })
    });

    const app = buildApiApp({ authService, now: () => new Date(FIXED_NOW) });
    const start = await request(app).get("/v1/auth/entra/start");
    const state = parseRedirectLocation(start.headers.location).searchParams.get("state");
    const callback = await request(app).get(
      `/v1/auth/entra/callback?code=code-user-1&state=${encodeURIComponent(String(state))}`
    );
    const cookie = extractCookie(callback.headers["set-cookie"]);

    const meBeforeLogout = await request(app).get("/v1/auth/me").set("Cookie", cookie);
    expect(meBeforeLogout.status).toBe(200);

    const logout = await request(app)
      .post("/v1/auth/logout")
      .set("Cookie", cookie)
      .set("origin", SAME_ORIGIN);
    expect(logout.status).toBe(204);

    const meAfterLogout = await request(app).get("/v1/auth/me").set("Cookie", cookie);
    expect(meAfterLogout.status).toBe(401);
    expect(meAfterLogout.body.code).toBe("UNAUTHORIZED");
  });

  it("routes post-login to tenant directly with one membership and chooser with many memberships", async () => {
    const authService = new AuthService({
      config: buildConfig(),
      repository,
      oidcClient: new FakeOidcClient({
        claimsByCode: {
          "code-user-1": buildClaims(
            "11111111-1111-1111-1111-111111111111",
            "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            "owner@acme.test",
            "Owner User"
          )
        }
      })
    });

    const nowValue = new Date(FIXED_NOW);
    const app = buildApiApp({ authService, now: () => new Date(nowValue) });

    const firstStart = await request(app).get("/v1/auth/entra/start");
    const firstState = parseRedirectLocation(firstStart.headers.location).searchParams.get("state");
    const firstCallback = await request(app).get(
      `/v1/auth/entra/callback?code=code-user-1&state=${encodeURIComponent(String(firstState))}`
    );
    const cookie = extractCookie(firstCallback.headers["set-cookie"]);

    const createFirstTenant = await request(app)
      .post("/v1/tenants")
      .set("Cookie", cookie)
      .set("origin", SAME_ORIGIN)
      .send({ slug: "acme", name: "Acme Corp" });
    expect(createFirstTenant.status).toBe(201);

    const secondStart = await request(app).get("/v1/auth/entra/start");
    const secondState = parseRedirectLocation(secondStart.headers.location).searchParams.get(
      "state"
    );
    const secondCallback = await request(app).get(
      `/v1/auth/entra/callback?code=code-user-1&state=${encodeURIComponent(String(secondState))}`
    );
    expect(secondCallback.status).toBe(302);
    expect(secondCallback.headers.location).toBe("/t/acme");

    const createSecondTenant = await request(app)
      .post("/v1/tenants")
      .set("Cookie", cookie)
      .set("origin", SAME_ORIGIN)
      .send({ slug: "globex", name: "Globex Corp" });
    expect(createSecondTenant.status).toBe(201);

    const thirdStart = await request(app).get("/v1/auth/entra/start");
    const thirdState = parseRedirectLocation(thirdStart.headers.location).searchParams.get("state");
    const thirdCallback = await request(app).get(
      `/v1/auth/entra/callback?code=code-user-1&state=${encodeURIComponent(String(thirdState))}`
    );
    expect(thirdCallback.status).toBe(302);
    expect(thirdCallback.headers.location).toBe("/workspaces");

    const rootReturnStart = await request(app).get("/v1/auth/entra/start?returnTo=%2F");
    const rootReturnState = parseRedirectLocation(
      rootReturnStart.headers.location
    ).searchParams.get("state");
    const rootReturnCallback = await request(app).get(
      `/v1/auth/entra/callback?code=code-user-1&state=${encodeURIComponent(String(rootReturnState))}`
    );
    expect(rootReturnCallback.status).toBe(302);
    expect(rootReturnCallback.headers.location).toBe("/workspaces");
  });

  it("returns /v1/auth/me successfully when Entra preferred_username is not an RFC email", async () => {
    const authService = new AuthService({
      config: buildConfig(),
      repository,
      oidcClient: new FakeOidcClient({
        claimsByCode: {
          "code-user-non-email-upn": {
            tid: "11111111-1111-1111-1111-111111111111",
            oid: "cccccccc-cccc-cccc-cccc-cccccccccccc",
            iss: "https://login.microsoftonline.com/11111111-1111-1111-1111-111111111111/v2.0",
            email: null,
            upn: "user_without_email_claim",
            name: "UPN Only User"
          }
        }
      })
    });

    const app = buildApiApp({ authService, now: () => new Date(FIXED_NOW) });
    const start = await request(app).get("/v1/auth/entra/start");
    const state = parseRedirectLocation(start.headers.location).searchParams.get("state");
    const callback = await request(app).get(
      `/v1/auth/entra/callback?code=code-user-non-email-upn&state=${encodeURIComponent(String(state))}`
    );
    expect(callback.status).toBe(302);
    const cookie = extractCookie(callback.headers["set-cookie"]);

    const me = await request(app).get("/v1/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({
      displayName: "UPN Only User",
      primaryEmail: null
    });
  });

  it("honors returnTo for authorized tenant deep links and rejects unauthorized tenant returnTo", async () => {
    const authService = new AuthService({
      config: buildConfig(),
      repository,
      oidcClient: new FakeOidcClient({
        claimsByCode: {
          "code-user-1": buildClaims(
            "11111111-1111-1111-1111-111111111111",
            "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            "owner@acme.test",
            "Owner User"
          )
        }
      })
    });

    const app = buildApiApp({ authService, now: () => new Date(FIXED_NOW) });

    const initialStart = await request(app).get("/v1/auth/entra/start");
    const initialState = parseRedirectLocation(initialStart.headers.location).searchParams.get(
      "state"
    );
    const initialCallback = await request(app).get(
      `/v1/auth/entra/callback?code=code-user-1&state=${encodeURIComponent(String(initialState))}`
    );
    const cookie = extractCookie(initialCallback.headers["set-cookie"]);

    const createTenant = await request(app)
      .post("/v1/tenants")
      .set("Cookie", cookie)
      .set("origin", SAME_ORIGIN)
      .send({ slug: "acme", name: "Acme Corp" });
    expect(createTenant.status).toBe(201);

    const allowedReturnStart = await request(app).get(
      "/v1/auth/entra/start?returnTo=%2Ft%2Facme%2Fprojects%2F123"
    );
    const allowedReturnState = parseRedirectLocation(
      allowedReturnStart.headers.location
    ).searchParams.get("state");
    const allowedReturnCallback = await request(app).get(
      `/v1/auth/entra/callback?code=code-user-1&state=${encodeURIComponent(String(allowedReturnState))}`
    );
    expect(allowedReturnCallback.status).toBe(302);
    expect(allowedReturnCallback.headers.location).toBe("/t/acme/projects/123");

    const blockedReturnStart = await request(app).get(
      "/v1/auth/entra/start?returnTo=%2Ft%2Fglobex%2Fprojects%2F999"
    );
    const blockedReturnState = parseRedirectLocation(
      blockedReturnStart.headers.location
    ).searchParams.get("state");
    const blockedReturnCallback = await request(app).get(
      `/v1/auth/entra/callback?code=code-user-1&state=${encodeURIComponent(String(blockedReturnState))}`
    );
    expect(blockedReturnCallback.status).toBe(302);
    expect(blockedReturnCallback.headers.location).toBe("/t/acme");
  });

  it("emits audit events for login success/failure and invite lifecycle", async () => {
    const claimsByCode = {
      "code-owner": buildClaims(
        "11111111-1111-1111-1111-111111111111",
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "owner@acme.test",
        "Owner User"
      ),
      "code-member": buildClaims(
        "11111111-1111-1111-1111-111111111111",
        "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        "member@acme.test",
        "Member User"
      )
    };

    const authService = new AuthService({
      config: buildConfig(),
      repository,
      oidcClient: new FakeOidcClient({ claimsByCode })
    });

    const app = buildApiApp({ authService, now: () => new Date(FIXED_NOW) });

    const ownerStart = await request(app).get("/v1/auth/entra/start");
    const ownerState = parseRedirectLocation(ownerStart.headers.location).searchParams.get("state");
    const ownerCallback = await request(app).get(
      `/v1/auth/entra/callback?code=code-owner&state=${encodeURIComponent(String(ownerState))}`
    );
    const ownerCookie = extractCookie(ownerCallback.headers["set-cookie"]);

    const createTenant = await request(app)
      .post("/v1/tenants")
      .set("Cookie", ownerCookie)
      .set("origin", SAME_ORIGIN)
      .send({ slug: "acme", name: "Acme Corp" });
    expect(createTenant.status).toBe(201);

    const createInvite = await request(app)
      .post("/v1/tenants/acme/invites")
      .set("Cookie", ownerCookie)
      .set("origin", SAME_ORIGIN)
      .send({ email: "member@acme.test", role: "member" });
    expect(createInvite.status).toBe(201);
    const inviteToken = extractInviteToken(createInvite.body);

    const memberStart = await request(app).get("/v1/auth/entra/start");
    const memberState = parseRedirectLocation(memberStart.headers.location).searchParams.get(
      "state"
    );
    const memberCallback = await request(app).get(
      `/v1/auth/entra/callback?code=code-member&state=${encodeURIComponent(String(memberState))}`
    );
    const memberCookie = extractCookie(memberCallback.headers["set-cookie"]);

    const acceptInvite = await request(app)
      .post(`/v1/tenants/acme/invites/${encodeURIComponent(inviteToken)}/accept`)
      .set("Cookie", memberCookie)
      .set("origin", SAME_ORIGIN);
    expect(acceptInvite.status).toBe(200);

    const failure = await request(app).get(
      "/v1/auth/entra/callback?error=access_denied&error_description=Denied"
    );
    expect(failure.status).toBe(401);

    const events = await repository.listAuditEvents();
    const eventTypes = events.map((event) => event.eventType);

    expect(eventTypes).toContain("auth.login.success");
    expect(eventTypes).toContain("auth.login.failure");
    expect(eventTypes).toContain("tenant.invite.create");
    expect(eventTypes).toContain("tenant.invite.accept");
  });

  it("enforces strict single-use invite acceptance semantics", async () => {
    const claimsByCode = {
      "code-owner": buildClaims(
        "11111111-1111-1111-1111-111111111111",
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "owner@acme.test",
        "Owner User"
      ),
      "code-member-1": buildClaims(
        "11111111-1111-1111-1111-111111111111",
        "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        "member@acme.test",
        "Member One"
      ),
      "code-member-2": buildClaims(
        "11111111-1111-1111-1111-111111111111",
        "dddddddd-dddd-dddd-dddd-dddddddddddd",
        "member@acme.test",
        "Member Two"
      )
    };

    const authService = new AuthService({
      config: buildConfig(),
      repository,
      oidcClient: new FakeOidcClient({ claimsByCode })
    });

    const app = buildApiApp({ authService, now: () => new Date(FIXED_NOW) });

    const ownerStart = await request(app).get("/v1/auth/entra/start");
    const ownerState = parseRedirectLocation(ownerStart.headers.location).searchParams.get("state");
    const ownerCallback = await request(app).get(
      `/v1/auth/entra/callback?code=code-owner&state=${encodeURIComponent(String(ownerState))}`
    );
    const ownerCookie = extractCookie(ownerCallback.headers["set-cookie"]);

    const createTenant = await request(app)
      .post("/v1/tenants")
      .set("Cookie", ownerCookie)
      .set("origin", SAME_ORIGIN)
      .send({ slug: "acme", name: "Acme Corp" });
    expect(createTenant.status).toBe(201);

    const invite = await request(app)
      .post("/v1/tenants/acme/invites")
      .set("Cookie", ownerCookie)
      .set("origin", SAME_ORIGIN)
      .send({ email: "member@acme.test", role: "member" });
    expect(invite.status).toBe(201);
    const inviteToken = extractInviteToken(invite.body);

    const memberOneStart = await request(app).get("/v1/auth/entra/start");
    const memberOneState = parseRedirectLocation(memberOneStart.headers.location).searchParams.get(
      "state"
    );
    const memberOneCallback = await request(app).get(
      `/v1/auth/entra/callback?code=code-member-1&state=${encodeURIComponent(String(memberOneState))}`
    );
    const memberOneCookie = extractCookie(memberOneCallback.headers["set-cookie"]);

    const firstAccept = await request(app)
      .post(`/v1/tenants/acme/invites/${encodeURIComponent(inviteToken)}/accept`)
      .set("Cookie", memberOneCookie)
      .set("origin", SAME_ORIGIN);
    expect(firstAccept.status).toBe(200);

    const sameUserReplay = await request(app)
      .post(`/v1/tenants/acme/invites/${encodeURIComponent(inviteToken)}/accept`)
      .set("Cookie", memberOneCookie)
      .set("origin", SAME_ORIGIN);
    expect(sameUserReplay.status).toBe(200);
    expect(sameUserReplay.body.joined).toBe(true);

    const memberTwoStart = await request(app).get("/v1/auth/entra/start");
    const memberTwoState = parseRedirectLocation(memberTwoStart.headers.location).searchParams.get(
      "state"
    );
    const memberTwoCallback = await request(app).get(
      `/v1/auth/entra/callback?code=code-member-2&state=${encodeURIComponent(String(memberTwoState))}`
    );
    const memberTwoCookie = extractCookie(memberTwoCallback.headers["set-cookie"]);

    const crossUserReplay = await request(app)
      .post(`/v1/tenants/acme/invites/${encodeURIComponent(inviteToken)}/accept`)
      .set("Cookie", memberTwoCookie)
      .set("origin", SAME_ORIGIN);
    expect(crossUserReplay.status).toBe(409);
    expect(crossUserReplay.body).toEqual({
      code: "INVITE_ALREADY_ACCEPTED",
      message: "Invite has already been accepted by another user"
    });
  });

  it("stores hashed nonce and encrypted PKCE verifier for OIDC auth requests", async () => {
    const authService = new AuthService({
      config: buildConfig(),
      repository,
      oidcClient: new FakeOidcClient({
        claimsByCode: {}
      })
    });

    const app = buildApiApp({ authService, now: () => new Date(FIXED_NOW) });
    const start = await request(app).get("/v1/auth/entra/start?returnTo=%2F");
    expect(start.status).toBe(302);
    const startLocation = parseRedirectLocation(start.headers.location);
    const nonce = startLocation.searchParams.get("nonce");
    expect(nonce).toBeTruthy();

    const inspector = new Client({ connectionString: databaseUrl });
    await inspector.connect();
    try {
      const rows = await inspector.query<{
        nonce_hash: string;
        pkce_verifier_encrypted_or_hashed: string;
      }>(
        `
          select nonce_hash, pkce_verifier_encrypted_or_hashed
          from auth_oidc_requests
          order by created_at desc
          limit 1
        `
      );

      const row = rows.rows.at(0);
      expect(row).toBeTruthy();
      expect(row?.nonce_hash).toMatch(/^[a-f0-9]{64}$/u);
      expect(row?.nonce_hash).not.toBe(String(nonce));
      expect(row?.pkce_verifier_encrypted_or_hashed).toMatch(/^enc:v1:/u);
    } finally {
      await inspector.end();
    }
  });
});
