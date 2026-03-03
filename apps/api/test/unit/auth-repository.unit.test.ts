import { describe, expect, it, vi } from "vitest";
import { AuthRepository } from "../../src/auth-service.js";

function buildRepository(pool: {
  query: ReturnType<typeof vi.fn>;
  connect?: ReturnType<typeof vi.fn>;
  end?: ReturnType<typeof vi.fn>;
}) {
  const repository = new AuthRepository("postgres://local:test@127.0.0.1:5432/compass");
  (repository as unknown as { pool: unknown }).pool = {
    query: pool.query,
    connect: pool.connect ?? vi.fn(),
    end: pool.end ?? vi.fn(async () => {})
  };
  return repository;
}

describe("AuthRepository", () => {
  it("persists and consumes oidc and desktop handoff requests", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: "oidc-1",
            nonce_hash: "nonce-hash",
            pkce_verifier_encrypted_or_hashed: "enc-payload",
            return_to: "/chat"
          }
        ]
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: "handoff-1",
            user_id: "usr-1",
            redirect_to: "/chat"
          }
        ]
      });

    const repository = buildRepository({ query });
    const now = new Date("2026-03-03T00:00:00.000Z");

    await repository.createOidcRequest({
      state: "state-1",
      nonceHash: "nonce-hash",
      encryptedPayload: "enc-payload",
      returnTo: "/chat",
      now
    });

    const consumedOidc = await repository.consumeOidcRequest("state-1", now);
    expect(consumedOidc).toEqual({
      id: "oidc-1",
      nonceHash: "nonce-hash",
      encryptedPayload: "enc-payload",
      returnTo: "/chat"
    });

    await repository.createDesktopHandoff({
      handoffToken: "handoff-token",
      userId: "usr-1",
      redirectTo: "/chat",
      now
    });

    const consumedHandoff = await repository.consumeDesktopHandoff("handoff-token", now);
    expect(consumedHandoff).toEqual({
      id: "handoff-1",
      userId: "usr-1",
      redirectTo: "/chat"
    });
  });

  it("creates and reads sessions", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: "session-1",
            user_id: "usr-1",
            expires_at: "2026-03-03T08:00:00.000Z",
            revoked_at: null,
            last_seen_at: "2026-03-03T00:00:00.000Z",
            primary_email: "owner@acme.test",
            display_name: "Owner User"
          }
        ]
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const repository = buildRepository({ query });
    const now = new Date("2026-03-03T00:00:00.000Z");

    const sessionId = await repository.createSession({
      userId: "usr-1",
      sessionTokenHash: "token-hash",
      userAgentHash: "ua-hash",
      ipHash: "ip-hash",
      now,
      expiresAt: new Date("2026-03-03T08:00:00.000Z")
    });
    expect(sessionId).toBeTruthy();

    const session = await repository.readSessionByTokenHash("token-hash", now);
    expect(session?.userId).toBe("usr-1");

    await repository.touchSession("session-1", now);
    await repository.revokeSessionByTokenHash("token-hash", now);
  });

  it("lists memberships and workspace records", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            organization_id: "org-1",
            organization_slug: "acme",
            organization_name: "Acme",
            role: "owner",
            status: "active"
          }
        ]
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            workspace_id: "ws-1",
            workspace_slug: "acme",
            workspace_name: "Acme Workspace",
            organization_id: "org-1",
            organization_slug: "acme",
            organization_name: "Acme",
            is_personal: false,
            role: "admin",
            status: "active"
          }
        ]
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            workspace_id: "ws-1",
            workspace_slug: "acme",
            workspace_name: "Acme Workspace",
            organization_id: "org-1",
            organization_slug: "acme",
            organization_name: "Acme",
            is_personal: false,
            membership_role: "admin",
            membership_status: "active",
            organization_role: "owner",
            organization_status: "active"
          }
        ]
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: "ws-1",
            organization_id: "org-1",
            organization_slug: "acme",
            organization_name: "Acme",
            slug: "acme",
            name: "Acme Workspace",
            is_personal: false,
            status: "active"
          }
        ]
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            user_id: "usr-1",
            primary_email: "owner@acme.test",
            display_name: "Owner User",
            role: "admin",
            status: "active"
          }
        ]
      });
    const repository = buildRepository({ query });

    const orgs = await repository.listOrganizationMemberships("usr-1");
    expect(orgs[0]?.role).toBe("owner");

    const workspaces = await repository.listWorkspaceMemberships("usr-1");
    expect(workspaces[0]?.role).toBe("admin");

    const membership = await repository.requireWorkspaceMembership({
      workspaceSlug: "acme",
      userId: "usr-1"
    });
    expect(membership?.workspaceId).toBe("ws-1");

    const workspace = await repository.findWorkspaceBySlug("acme");
    expect(workspace?.slug).toBe("acme");

    const members = await repository.listWorkspaceMembers("ws-1");
    expect(members).toHaveLength(1);
  });

  it("creates and accepts workspace invites", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ accepted_by_user_id: "usr-1" }]
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }),
      release: vi.fn()
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: "invite-1",
            workspace_id: "ws-1",
            workspace_slug: "acme",
            organization_id: "org-1",
            email_normalized: "owner@acme.test",
            role: "member",
            expires_at: "2026-03-10T00:00:00.000Z",
            accepted_at: null,
            accepted_by_user_id: null
          }
        ]
      })
      .mockResolvedValueOnce({
        rowCount: 2,
        rows: [
          {
            primary_email: "owner@acme.test",
            identity_email: null,
            identity_upn: null
          },
          {
            primary_email: null,
            identity_email: "owner+alias@acme.test",
            identity_upn: "owner-upn@acme.test"
          }
        ]
      });

    const repository = buildRepository({
      query,
      connect: vi.fn(async () => client)
    });

    const created = await repository.createWorkspaceInvite({
      workspaceId: "ws-1",
      emailNormalized: "owner@acme.test",
      role: "member",
      tokenHash: "token-hash",
      invitedByUserId: "usr-1",
      expiresAt: new Date("2026-03-10T00:00:00.000Z")
    });
    expect(created.inviteId).toBeTruthy();

    const invite = await repository.findWorkspaceInviteByToken({
      workspaceSlug: "acme",
      tokenHash: "token-hash"
    });
    expect(invite?.workspaceId).toBe("ws-1");

    const acceptance = await repository.markWorkspaceInviteAcceptedAndUpsertMembership({
      inviteId: "invite-1",
      workspaceId: "ws-1",
      organizationId: "org-1",
      userId: "usr-1",
      role: "member",
      now: new Date("2026-03-03T00:00:00.000Z")
    });
    expect(acceptance).toBe("accepted_now");
    expect(client.release).toHaveBeenCalledTimes(1);

    const emails = await repository.listUserKnownEmails("usr-1");
    expect(emails).toEqual(
      expect.arrayContaining(["owner@acme.test", "owner+alias@acme.test", "owner-upn@acme.test"])
    );
  });

  it("ensures personal workspace and creates workspace", async () => {
    const personalClient = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: "org-1", slug: "personal-owner", name: "Owner Personal Workspace" }]
        })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: "ws-1", slug: "personal-owner" }]
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }),
      release: vi.fn()
    };
    const createWorkspaceClient = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: "org-1", slug: "personal-owner", name: "Owner Personal Workspace" }]
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }),
      release: vi.fn()
    };
    const repository = buildRepository({
      query: vi.fn(),
      connect: vi
        .fn()
        .mockResolvedValueOnce(personalClient)
        .mockResolvedValueOnce(createWorkspaceClient)
    });

    const personal = await repository.ensurePersonalWorkspace({
      userId: "usr-1",
      now: new Date("2026-03-03T00:00:00.000Z"),
      displayName: "Owner",
      primaryEmail: "owner@acme.test"
    });
    expect(personal.workspaceId).toBe("ws-1");

    const created = await repository.createWorkspace({
      userId: "usr-1",
      request: {
        slug: "team-acme",
        name: "Team Acme"
      },
      now: new Date("2026-03-03T00:00:00.000Z")
    });
    expect(created.workspace.slug).toBe("team-acme");
    expect(created.membership.role).toBe("admin");
  });

  it("returns existing personal workspace without recreating organization/workspace", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // begin
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              organization_id: "org-existing",
              organization_slug: "personal-owner",
              workspace_id: "ws-existing",
              workspace_slug: "personal-owner"
            }
          ]
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // org membership upsert
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // workspace membership upsert
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }), // commit
      release: vi.fn()
    };
    const repository = buildRepository({
      query: vi.fn(),
      connect: vi.fn(async () => client)
    });

    const result = await repository.ensurePersonalWorkspace({
      userId: "usr-existing",
      now: new Date("2026-03-03T00:00:00.000Z"),
      displayName: "Existing User",
      primaryEmail: "existing@acme.test"
    });

    expect(result).toEqual({
      organizationId: "org-existing",
      organizationSlug: "personal-owner",
      workspaceId: "ws-existing",
      workspaceSlug: "personal-owner"
    });
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("rolls back ensurePersonalWorkspace when personal organization cannot be resolved", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // begin
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // no existing personal workspace
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // insert personal org
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // read personal org -> missing
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }), // rollback
      release: vi.fn()
    };
    const repository = buildRepository({
      query: vi.fn(),
      connect: vi.fn(async () => client)
    });

    await expect(
      repository.ensurePersonalWorkspace({
        userId: "usr-missing-org",
        now: new Date("2026-03-03T00:00:00.000Z"),
        displayName: "Missing Org",
        primaryEmail: "missing-org@acme.test"
      })
    ).rejects.toThrow("Unable to resolve personal organization");

    expect(client.query).toHaveBeenLastCalledWith("rollback");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("tolerates expected unique conflicts while creating personal workspace", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // begin
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // no existing personal workspace
        .mockRejectedValueOnce(
          new Error("duplicate key value violates unique constraint organizations_unique_slug")
        ) // insert personal org unique conflict
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: "org-unique", slug: "personal-unique", name: "Personal Unique" }]
        }) // read personal org
        .mockRejectedValueOnce(
          new Error("duplicate key value violates unique constraint workspaces_unique_slug")
        ) // insert personal workspace unique conflict
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: "ws-unique", slug: "personal-unique" }]
        }) // read personal workspace
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // org membership upsert
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // workspace membership upsert
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }), // commit
      release: vi.fn()
    };
    const repository = buildRepository({
      query: vi.fn(),
      connect: vi.fn(async () => client)
    });

    const result = await repository.ensurePersonalWorkspace({
      userId: "usr-unique",
      now: new Date("2026-03-03T00:00:00.000Z"),
      displayName: "Unique User",
      primaryEmail: "unique@acme.test"
    });

    expect(result.organizationId).toBe("org-unique");
    expect(result.workspaceId).toBe("ws-unique");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("rethrows unexpected ensurePersonalWorkspace insert errors and rolls back", async () => {
    const unexpected = new Error("database unavailable");
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // begin
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // no existing personal workspace
        .mockRejectedValueOnce(unexpected) // insert personal org unexpected failure
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }), // rollback
      release: vi.fn()
    };
    const repository = buildRepository({
      query: vi.fn(),
      connect: vi.fn(async () => client)
    });

    await expect(
      repository.ensurePersonalWorkspace({
        userId: "usr-fail",
        now: new Date("2026-03-03T00:00:00.000Z"),
        displayName: "Failing User",
        primaryEmail: "fail@acme.test"
      })
    ).rejects.toThrow("database unavailable");

    expect(client.query).toHaveBeenLastCalledWith("rollback");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("rolls back createWorkspace when home organization cannot be resolved", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // begin
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // no home organization
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }), // rollback
      release: vi.fn()
    };
    const repository = buildRepository({
      query: vi.fn(),
      connect: vi.fn(async () => client)
    });

    await expect(
      repository.createWorkspace({
        userId: "usr-without-home-org",
        request: { slug: "no-org", name: "No Org" },
        now: new Date("2026-03-03T00:00:00.000Z")
      })
    ).rejects.toThrow("Personal organization not found for workspace creation");

    expect(client.query).toHaveBeenLastCalledWith("rollback");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("writes and reads audit events", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            event_type: "auth.login.success",
            actor_user_id: "usr-1",
            tenant_id: "org-1",
            metadata: { provider: "entra" }
          }
        ]
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            event_type: "workspace.create",
            actor_user_id: "usr-1",
            tenant_id: "org-1",
            metadata: { workspaceSlug: "acme" }
          }
        ]
      });
    const repository = buildRepository({ query });

    await repository.insertAuditEvent({
      eventType: "auth.login.success",
      actorUserId: "usr-1",
      tenantId: "org-1",
      metadata: { provider: "entra" },
      now: new Date("2026-03-03T00:00:00.000Z")
    });

    const allEvents = await repository.listAuditEvents();
    expect(allEvents).toHaveLength(1);
    expect(allEvents[0]?.eventType).toBe("auth.login.success");

    const filteredEvents = await repository.listAuditEvents({
      eventType: "workspace.create"
    });
    expect(filteredEvents[0]?.eventType).toBe("workspace.create");
  });

  it("updates existing identities in findOrCreateUserForIdentity", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ user_id: "usr-1", primary_email: "owner@acme.test", display_name: "Owner" }]
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }),
      release: vi.fn()
    };
    const repository = buildRepository({
      query: vi.fn(),
      connect: vi.fn(async () => client)
    });

    const user = await repository.findOrCreateUserForIdentity({
      tid: "tenant-1",
      oid: "oid-1",
      iss: "https://login.microsoftonline.com/tenant-1/v2.0",
      email: "owner@acme.test",
      upn: "owner@acme.test",
      name: "Owner User"
    });

    expect(user.id).toBe("usr-1");
    expect(user.primaryEmail).toBe("owner@acme.test");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("clears and closes repository resources", async () => {
    const query = vi.fn(async () => ({ rowCount: 0, rows: [] }));
    const end = vi.fn(async () => {});
    const repository = buildRepository({ query, end });

    await repository.clearAuthData();
    await repository.close();

    expect(query).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
  });
});
