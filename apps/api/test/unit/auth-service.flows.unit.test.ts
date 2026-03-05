import { describe, expect, it, vi } from "vitest";
import {
  ApiError,
  AuthService,
  type EntraAuthConfig,
  __internalAuthService
} from "../../src/auth-service.js";

type RepositoryStub = Record<string, ReturnType<typeof vi.fn>>;

const OIDC_KEY = Buffer.alloc(32, 7).toString("base64url");

const {
  asStringOrNull,
  parseBooleanQueryFlag,
  sanitizeUriScheme,
  asValidEmailOrNull,
  resolvePrimaryEmail,
  buildPersonalTenantSlug,
  buildPersonalTenantName,
  parseOidcStateEncryptionKey,
  encryptOidcRequestPayload,
  decryptOidcRequestPayload,
  sanitizeReturnTo,
  normalizePostLoginReturnTo,
  buildLoginRedirect,
  nowPlusSeconds,
  extractClientIp,
  toOrganizationRole,
  toWorkspaceRole
} = __internalAuthService;

function createEntraConfig(overrides: Partial<EntraAuthConfig> = {}): EntraAuthConfig {
  return {
    authMode: "entra",
    clientId: "entra-client",
    clientSecret: "entra-secret",
    authorityHost: "https://login.microsoftonline.com",
    tenantSegment: "organizations",
    allowedTenantIds: [],
    scope: "openid profile email",
    redirectUri: "https://compass.glcsolutions.ca/v1/auth/entra/callback",
    webBaseUrl: "https://compass.glcsolutions.ca",
    desktopAuthScheme: "ca.glsolutions.compass",
    oidcStateEncryptionKey: OIDC_KEY,
    sessionTtlSeconds: 3600,
    sessionIdleTtlSeconds: 1200,
    ...overrides
  };
}

function createRepositoryStub(overrides: Partial<RepositoryStub> = {}): RepositoryStub {
  const oidcRequests = new Map<
    string,
    { id: string; nonceHash: string; encryptedPayload: string; returnTo: string | null }
  >();
  const desktopHandoffs = new Map<string, { id: string; userId: string; redirectTo: string }>();

  const base: RepositoryStub = {
    createOidcRequest: vi.fn(
      async (input: {
        state: string;
        nonceHash: string;
        encryptedPayload: string;
        returnTo: string | null;
      }) => {
        oidcRequests.set(input.state, {
          id: `oidc-${input.state}`,
          nonceHash: input.nonceHash,
          encryptedPayload: input.encryptedPayload,
          returnTo: input.returnTo
        });
      }
    ),
    consumeOidcRequest: vi.fn(async (state: string) => {
      const request = oidcRequests.get(state) ?? null;
      oidcRequests.delete(state);
      return request;
    }),
    createDesktopHandoff: vi.fn(
      async (input: { handoffToken: string; userId: string; redirectTo: string }) => {
        desktopHandoffs.set(input.handoffToken, {
          id: `desktop-${input.handoffToken}`,
          userId: input.userId,
          redirectTo: input.redirectTo
        });
      }
    ),
    consumeDesktopHandoff: vi.fn(async (handoffToken: string) => {
      const handoff = desktopHandoffs.get(handoffToken) ?? null;
      desktopHandoffs.delete(handoffToken);
      return handoff;
    }),
    findOrCreateUserForIdentity: vi.fn(async () => ({
      id: "usr-1",
      primaryEmail: "owner@acme.test",
      displayName: "Owner User"
    })),
    ensurePersonalWorkspace: vi.fn(async () => {}),
    insertAuditEvent: vi.fn(async () => {}),
    listWorkspaceMemberships: vi.fn(async () => []),
    createSession: vi.fn(async () => {}),
    readSessionByTokenHash: vi.fn(async () => null),
    touchSession: vi.fn(async () => {}),
    revokeSessionByTokenHash: vi.fn(async () => {}),
    listOrganizationMemberships: vi.fn(async () => []),
    createWorkspace: vi.fn(async () => ({
      workspace: {
        id: "ws-1",
        slug: "acme",
        name: "Acme Workspace",
        organizationId: "org-1",
        organizationSlug: "acme",
        organizationName: "Acme",
        isPersonal: false,
        status: "active"
      },
      membership: {
        role: "admin",
        status: "active"
      }
    })),
    requireWorkspaceMembership: vi.fn(async () => ({
      workspaceId: "ws-1",
      workspaceSlug: "acme",
      workspaceName: "Acme Workspace",
      organizationId: "org-1",
      organizationSlug: "acme",
      organizationName: "Acme",
      isPersonal: false,
      membershipRole: "admin",
      membershipStatus: "active"
    })),
    findWorkspaceBySlug: vi.fn(async () => ({
      id: "ws-1",
      slug: "acme",
      name: "Acme Workspace",
      organizationId: "org-1",
      organizationSlug: "acme",
      organizationName: "Acme",
      isPersonal: false,
      status: "active"
    })),
    listWorkspaceMembers: vi.fn(async () => []),
    createWorkspaceInvite: vi.fn(async () => ({
      inviteId: "invite-1",
      expiresAt: "2026-03-10T00:00:00.000Z"
    })),
    findWorkspaceInviteByToken: vi.fn(async () => null),
    listUserKnownEmails: vi.fn(async () => ["owner@acme.test"]),
    markWorkspaceInviteAcceptedAndUpsertMembership: vi.fn(async () => "accepted"),
    close: vi.fn(async () => {})
  };

  return {
    ...base,
    ...overrides
  };
}

function createOidcClientStub() {
  const stub = {
    buildAuthorizeUrl: vi.fn(
      (input: { state: string; nonce: string; codeChallenge: string; redirectUri: string }) => {
        const url = new URL("https://login.microsoftonline.com/oauth2/v2.0/authorize");
        url.searchParams.set("state", input.state);
        url.searchParams.set("nonce", input.nonce);
        url.searchParams.set("code_challenge", input.codeChallenge);
        url.searchParams.set("redirect_uri", input.redirectUri);
        return url.toString();
      }
    ),
    buildAdminConsentUrl: vi.fn(
      (input: { state: string; tenantHint?: string; redirectUri: string }) => {
        const url = new URL("https://login.microsoftonline.com/adminconsent");
        url.searchParams.set("state", input.state);
        url.searchParams.set("redirect_uri", input.redirectUri);
        if (input.tenantHint) {
          url.searchParams.set("tenant", input.tenantHint);
        }
        return url.toString();
      }
    ),
    exchangeCodeForIdToken: vi.fn(async () => "id-token"),
    verifyIdToken: vi.fn(async () => ({
      tid: "tenant-1",
      oid: "oid-1",
      iss: "https://login.microsoftonline.com/tenant-1/v2.0",
      email: "owner@acme.test",
      upn: "owner@acme.test",
      name: "Owner User"
    }))
  };

  return stub;
}

function buildService(input: {
  config?: EntraAuthConfig;
  repository?: RepositoryStub;
  oidcClient?: ReturnType<typeof createOidcClientStub>;
}) {
  const repository = input.repository ?? createRepositoryStub();
  const oidcClient = input.oidcClient ?? createOidcClientStub();
  const config = input.config ?? createEntraConfig();

  const service = new AuthService({
    config,
    repository: repository as never,
    oidcClient
  });

  return {
    service,
    repository,
    oidcClient
  };
}

function readState(redirectUrl: string): string {
  return new URL(redirectUrl).searchParams.get("state") ?? "";
}

describe("auth-service helpers", () => {
  it("normalizes and validates helper values", () => {
    expect(asStringOrNull("value")).toBe("value");
    expect(asStringOrNull(5)).toBeNull();
    expect(parseBooleanQueryFlag(undefined)).toBe(false);
    expect(parseBooleanQueryFlag("TrUe")).toBe(true);
    expect(parseBooleanQueryFlag("no")).toBe(false);
    expect(sanitizeUriScheme("Compass-App")).toBe("compass-app");
    expect(sanitizeUriScheme("bad scheme!")).toBe("ca.glsolutions.compass");
    expect(sanitizeUriScheme(undefined)).toBe("ca.glsolutions.compass");
    expect(asValidEmailOrNull("Owner@Acme.Test")).toBe("Owner@Acme.Test");
    expect(asValidEmailOrNull("invalid-email")).toBeNull();
    expect(resolvePrimaryEmail({ email: null, upn: "owner@acme.test" })).toBe("owner@acme.test");
    expect(buildPersonalTenantSlug("ABC_123")).toBe("personal-abc-123");
    expect(buildPersonalTenantSlug("___")).toBe("personal-user");
    expect(
      buildPersonalTenantName({
        userId: "user-1",
        displayName: "Owner",
        primaryEmail: "owner@acme.test"
      })
    ).toBe("Owner Personal Workspace");
    expect(
      buildPersonalTenantName({
        userId: "user-1",
        displayName: null,
        primaryEmail: "owner@acme.test"
      })
    ).toBe("owner@acme.test Personal Workspace");
    expect(
      buildPersonalTenantName({
        userId: "user-1",
        displayName: null,
        primaryEmail: "invalid-email"
      })
    ).toBe("Personal Workspace");
  });

  it("encrypts and decrypts oidc payloads with a valid key", () => {
    const key = parseOidcStateEncryptionKey(OIDC_KEY);
    expect(key).not.toBeNull();
    if (!key) {
      return;
    }

    const encrypted = encryptOidcRequestPayload({
      encryptionKey: key,
      flow: "entra-login",
      client: "desktop",
      nonce: "nonce-1",
      pkceVerifier: "pkce-1"
    });

    const decrypted = decryptOidcRequestPayload({
      encryptionKey: key,
      encodedPayload: encrypted
    });

    expect(decrypted).toEqual({
      flow: "entra-login",
      client: "desktop",
      nonce: "nonce-1",
      pkceVerifier: "pkce-1"
    });
  });

  it("rejects invalid oidc key and payload formats", () => {
    expect(parseOidcStateEncryptionKey(undefined)).toBeNull();
    expect(parseOidcStateEncryptionKey(Buffer.alloc(16, 3).toString("base64url"))).toBeNull();

    const key = parseOidcStateEncryptionKey(OIDC_KEY);
    expect(key).not.toBeNull();
    if (!key) {
      return;
    }

    expect(() =>
      decryptOidcRequestPayload({
        encryptionKey: key,
        encodedPayload: "not-encrypted"
      })
    ).toThrow("OIDC request payload format is invalid");

    expect(() =>
      decryptOidcRequestPayload({
        encryptionKey: key,
        encodedPayload: "enc:v1:missing.parts"
      })
    ).toThrow("OIDC request payload format is invalid");

    const invalidFlowEncrypted = encryptOidcRequestPayload({
      encryptionKey: key,
      flow: "invalid-flow" as unknown as "entra-login",
      client: "browser",
      nonce: "nonce-1",
      pkceVerifier: "pkce-1"
    });
    expect(() =>
      decryptOidcRequestPayload({
        encryptionKey: key,
        encodedPayload: invalidFlowEncrypted
      })
    ).toThrow("OIDC request payload flow is invalid");

    const missingFieldsEncrypted = encryptOidcRequestPayload({
      encryptionKey: key,
      flow: "entra-login",
      client: "browser",
      nonce: "",
      pkceVerifier: ""
    });
    expect(() =>
      decryptOidcRequestPayload({
        encryptionKey: key,
        encodedPayload: missingFieldsEncrypted
      })
    ).toThrow("OIDC request payload is missing required fields");
  });

  it("builds normalized redirects and request metadata", () => {
    expect(sanitizeReturnTo(undefined)).toBeNull();
    expect(sanitizeReturnTo("/chat")).toBe("/chat");
    expect(sanitizeReturnTo("//evil.example")).toBeNull();
    expect(sanitizeReturnTo("https://evil.example")).toBeNull();
    expect(normalizePostLoginReturnTo("/t/acme/chat")).toBe("/chat");
    expect(normalizePostLoginReturnTo("/w/acme")).toBe("/chat");
    expect(normalizePostLoginReturnTo("/chat?from=login")).toBe("/chat?from=login");
    expect(
      buildLoginRedirect({
        returnTo: "/chat",
        tenantHint: "tenant-1",
        consent: "granted"
      })
    ).toContain("consent=granted");
    expect(
      buildLoginRedirect({
        error: "denied",
        returnTo: "https://evil.example"
      })
    ).toContain("returnTo=%2F");
    expect(nowPlusSeconds(new Date("2026-03-03T00:00:00.000Z"), 60).toISOString()).toBe(
      "2026-03-03T00:01:00.000Z"
    );
    expect(extractClientIp("198.51.100.7, 10.0.0.2", "127.0.0.1")).toBe("198.51.100.7");
    expect(toOrganizationRole("owner")).toBe("owner");
    expect(() => toOrganizationRole("bad-value")).toThrow("Unexpected organization role");
    expect(toWorkspaceRole("admin")).toBe("admin");
    expect(toWorkspaceRole("unexpected")).toBe("member");
  });
});

describe("AuthService flows", () => {
  it("completes mock login and creates a session", async () => {
    const { service, repository } = buildService({
      config: createEntraConfig({
        authMode: "mock"
      })
    });

    const result = await service.startEntraLogin({
      returnTo: "/chat",
      userAgent: "test-agent",
      ip: "203.0.113.7",
      now: new Date("2026-03-03T00:00:00.000Z")
    });

    expect(result.redirectUrl).toBe("/chat");
    expect(result.sessionToken).toBeTruthy();
    expect(repository.findOrCreateUserForIdentity).toHaveBeenCalledTimes(1);
    expect(repository.createSession).toHaveBeenCalledTimes(1);
    expect(repository.insertAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "auth.login.success"
      })
    );
  });

  it("starts entra login and persists encrypted state request", async () => {
    const { service, repository, oidcClient } = buildService({});

    const result = await service.startEntraLogin({
      returnTo: "/chat",
      client: "browser",
      userAgent: "browser",
      ip: "203.0.113.7",
      now: new Date("2026-03-03T00:00:00.000Z")
    });

    expect(result.redirectUrl).toContain("state=");
    expect(result.redirectUrl).toContain(
      "redirect_uri=https%3A%2F%2Fcompass.glcsolutions.ca%2Fv1%2Fauth%2Fentra%2Fcallback"
    );
    expect(repository.createOidcRequest).toHaveBeenCalledTimes(1);
    expect(oidcClient.buildAuthorizeUrl).toHaveBeenCalledTimes(1);
  });

  it("uses runtime redirect URI overrides for start and callback token exchange", async () => {
    const { service, oidcClient } = buildService({});
    const now = new Date("2026-03-03T00:00:00.000Z");
    const runtimeRedirectUri = "https://compass.clac.ca/v1/auth/entra/callback";

    const start = await service.startEntraLogin({
      returnTo: "/chat",
      client: "browser",
      redirectUri: runtimeRedirectUri,
      userAgent: "browser",
      ip: "203.0.113.7",
      now
    });

    expect(start.redirectUrl).toContain(
      "redirect_uri=https%3A%2F%2Fcompass.clac.ca%2Fv1%2Fauth%2Fentra%2Fcallback"
    );

    await service.handleEntraCallback({
      state: readState(start.redirectUrl),
      code: "code-1",
      redirectUri: runtimeRedirectUri,
      userAgent: "browser",
      ip: "203.0.113.7",
      now
    });

    expect(oidcClient.exchangeCodeForIdToken).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUri: runtimeRedirectUri
      })
    );
  });

  it("handles admin consent callbacks", async () => {
    const { service } = buildService({});
    const now = new Date("2026-03-03T00:00:00.000Z");

    const start = await service.startAdminConsent({
      tenantHint: "tenant-1",
      returnTo: "/chat",
      client: "desktop",
      now
    });

    const callback = await service.handleEntraCallback({
      state: readState(start.redirectUrl),
      adminConsent: "true",
      tenant: "tenant-1",
      userAgent: "browser",
      ip: "203.0.113.7",
      now
    });

    expect(callback.redirectTo).toContain("ca.glsolutions.compass://auth/callback");
    expect(callback.redirectTo).toContain("next=");
  });

  it("handles successful entra callback and returns browser session", async () => {
    const { service, repository, oidcClient } = buildService({});
    const now = new Date("2026-03-03T00:00:00.000Z");

    const start = await service.startEntraLogin({
      returnTo: "/chat",
      client: "browser",
      userAgent: "browser",
      ip: "203.0.113.7",
      now
    });

    const callback = await service.handleEntraCallback({
      state: readState(start.redirectUrl),
      code: "code-1",
      userAgent: "browser",
      ip: "203.0.113.7",
      now
    });

    expect(callback.redirectTo).toBe("/chat");
    expect(callback.sessionToken).toBeTruthy();
    expect(oidcClient.exchangeCodeForIdToken).toHaveBeenCalledTimes(1);
    expect(oidcClient.verifyIdToken).toHaveBeenCalledTimes(1);
    expect(repository.createSession).toHaveBeenCalledTimes(1);
  });

  it("rejects entra tenants outside allow-list", async () => {
    const oidcClient = createOidcClientStub();
    oidcClient.verifyIdToken.mockResolvedValue({
      tid: "forbidden-tenant",
      oid: "oid-1",
      iss: "https://login.microsoftonline.com/forbidden-tenant/v2.0",
      email: "owner@acme.test",
      upn: "owner@acme.test",
      name: "Owner User"
    });

    const { service, repository } = buildService({
      config: createEntraConfig({
        allowedTenantIds: ["tenant-1"]
      }),
      oidcClient
    });
    const now = new Date("2026-03-03T00:00:00.000Z");
    const start = await service.startEntraLogin({
      returnTo: "/chat",
      userAgent: "browser",
      ip: "203.0.113.7",
      now
    });

    await expect(
      service.handleEntraCallback({
        state: readState(start.redirectUrl),
        code: "code-1",
        userAgent: "browser",
        ip: "203.0.113.7",
        now
      })
    ).rejects.toMatchObject({
      code: "ENTRA_TENANT_NOT_ALLOWED"
    });

    expect(repository.insertAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "auth.login.failure"
      })
    );
  });

  it("reads auth me and handles idle session timeout", async () => {
    const activeRepository = createRepositoryStub({
      readSessionByTokenHash: vi.fn(async () => ({
        id: "session-1",
        userId: "usr-1",
        expiresAt: "2026-03-03T01:00:00.000Z",
        revokedAt: null,
        lastSeenAt: "2026-03-03T00:10:00.000Z",
        primaryEmail: "owner@acme.test",
        displayName: "Owner User"
      })),
      listOrganizationMemberships: vi.fn(async () => [
        {
          organizationId: "org-1",
          organizationSlug: "acme",
          organizationName: "Acme",
          role: "owner",
          status: "active"
        }
      ]),
      listWorkspaceMemberships: vi.fn(async () => [
        {
          workspaceId: "ws-1",
          workspaceSlug: "acme",
          workspaceName: "Acme Workspace",
          organizationId: "org-1",
          organizationSlug: "acme",
          organizationName: "Acme",
          role: "admin",
          isPersonal: false,
          status: "active"
        }
      ])
    });
    const active = buildService({
      repository: activeRepository
    }).service;

    const authMe = await active.readAuthMe({
      sessionToken: "session-token",
      now: new Date("2026-03-03T00:20:00.000Z")
    });

    expect(authMe.authenticated).toBe(true);
    expect(authMe.user?.id).toBe("usr-1");
    expect(activeRepository.touchSession).toHaveBeenCalledTimes(1);

    const timedOutRepository = createRepositoryStub({
      readSessionByTokenHash: vi.fn(async () => ({
        id: "session-1",
        userId: "usr-1",
        expiresAt: "2026-03-03T01:00:00.000Z",
        revokedAt: null,
        lastSeenAt: "2026-03-03T00:00:00.000Z",
        primaryEmail: "owner@acme.test",
        displayName: "Owner User"
      }))
    });
    const timedOut = buildService({
      repository: timedOutRepository
    }).service;

    await expect(
      timedOut.readAuthMe({
        sessionToken: "session-token",
        now: new Date("2026-03-03T01:00:01.000Z")
      })
    ).rejects.toMatchObject({
      code: "SESSION_IDLE_TIMEOUT"
    });
    expect(timedOutRepository.revokeSessionByTokenHash).toHaveBeenCalledTimes(1);
  });

  it("completes desktop handoff and supports workspace invite flow", async () => {
    const repository = createRepositoryStub({
      readSessionByTokenHash: vi.fn(async () => ({
        id: "session-1",
        userId: "usr-1",
        expiresAt: "2026-03-03T08:00:00.000Z",
        revokedAt: null,
        lastSeenAt: "2026-03-03T00:00:00.000Z",
        primaryEmail: "owner@acme.test",
        displayName: "Owner User"
      })),
      consumeDesktopHandoff: vi.fn(async () => ({
        id: "handoff-1",
        userId: "usr-1",
        redirectTo: "/chat"
      })),
      findWorkspaceInviteByToken: vi.fn(async () => ({
        id: "invite-1",
        workspaceId: "ws-1",
        workspaceSlug: "acme",
        organizationId: "org-1",
        emailNormalized: "owner@acme.test",
        role: "member",
        expiresAt: "2026-03-10T00:00:00.000Z",
        acceptedAt: null,
        acceptedByUserId: null
      }))
    });

    const { service } = buildService({
      repository
    });
    const now = new Date("2026-03-03T00:00:00.000Z");

    const desktop = await service.completeDesktopLogin({
      handoffToken: "handoff-token",
      userAgent: "desktop",
      ip: "203.0.113.7",
      now
    });
    expect(desktop.sessionToken).toBeTruthy();
    expect(desktop.redirectTo).toBe("/chat");

    const invite = await service.createWorkspaceInvite({
      sessionToken: "session-token",
      workspaceSlug: "acme",
      request: {
        email: "owner@acme.test",
        role: "member",
        expiresInDays: 3
      },
      now
    });
    expect(invite.inviteId).toBe("invite-1");
    expect(invite.token).toBeTruthy();

    const accepted = await service.acceptWorkspaceInvite({
      sessionToken: "session-token",
      workspaceSlug: "acme",
      inviteToken: "token-value",
      now
    });
    expect(accepted.joined).toBe(true);
    expect(accepted.workspaceSlug).toBe("acme");
  });

  it("maps workspace creation slug conflicts to API error", async () => {
    const { service } = buildService({
      repository: createRepositoryStub({
        readSessionByTokenHash: vi.fn(async () => ({
          id: "session-1",
          userId: "usr-1",
          expiresAt: "2026-03-03T08:00:00.000Z",
          revokedAt: null,
          lastSeenAt: "2026-03-03T00:00:00.000Z",
          primaryEmail: "owner@acme.test",
          displayName: "Owner User"
        })),
        createWorkspace: vi.fn(async () => {
          throw new Error("duplicate key value violates unique constraint workspaces_unique_slug");
        })
      })
    });

    await expect(
      service.createWorkspace({
        sessionToken: "session-token",
        request: {
          name: "Acme",
          slug: "acme"
        },
        now: new Date("2026-03-03T00:00:00.000Z")
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "WORKSPACE_SLUG_CONFLICT"
    });
  });

  it("throws invalid callback when state or code is missing", async () => {
    const { service } = buildService({});

    await expect(
      service.handleEntraCallback({
        state: "state-only",
        userAgent: "browser",
        ip: "203.0.113.7",
        now: new Date("2026-03-03T00:00:00.000Z")
      })
    ).rejects.toMatchObject({
      status: 400,
      code: "INVALID_CALLBACK"
    });
  });
});

describe("api error type", () => {
  it("preserves status and code metadata", () => {
    const error = new ApiError(401, "UNAUTHORIZED", "Authentication required");
    expect(error.status).toBe(401);
    expect(error.code).toBe("UNAUTHORIZED");
    expect(error.message).toBe("Authentication required");
  });
});
