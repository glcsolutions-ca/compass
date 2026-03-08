import { describe, expect, it, vi } from "vitest";
import type { AuthRepository, AuthService } from "../auth/auth-service.js";
import { WorkspacesService } from "./workspaces-service.js";

type RepositoryStub = Record<string, ReturnType<typeof vi.fn>>;

function createRepositoryStub(overrides: Partial<RepositoryStub> = {}): RepositoryStub {
  const base: RepositoryStub = {
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
    insertAuditEvent: vi.fn(async () => {}),
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
    listWorkspaceMembers: vi.fn(async () => [
      {
        userId: "usr-1",
        primaryEmail: "owner@acme.test",
        displayName: "Owner User",
        role: "admin",
        status: "active"
      }
    ]),
    createWorkspaceInvite: vi.fn(async () => ({
      inviteId: "invite-1",
      expiresAt: "2026-03-10T00:00:00.000Z"
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
    })),
    listUserKnownEmails: vi.fn(async () => ["owner@acme.test"]),
    markWorkspaceInviteAcceptedAndUpsertMembership: vi.fn(async () => "accepted")
  };

  return {
    ...base,
    ...overrides
  };
}

function createAuthServiceStub(
  overrides: Partial<Pick<AuthService, "requireSessionActor">> = {}
): Pick<AuthService, "requireSessionActor"> {
  return {
    requireSessionActor: vi.fn(async () => ({
      userId: "usr-1",
      primaryEmail: "owner@acme.test",
      displayName: "Owner User"
    })),
    ...overrides
  };
}

function buildService(input: {
  repository?: RepositoryStub;
  authService?: Pick<AuthService, "requireSessionActor">;
}) {
  return new WorkspacesService(
    (input.repository ?? createRepositoryStub()) as unknown as AuthRepository,
    input.authService ?? createAuthServiceStub()
  );
}

describe("WorkspacesService", () => {
  it("creates a workspace and records an audit event", async () => {
    const repository = createRepositoryStub();
    const authService = createAuthServiceStub();
    const service = buildService({ repository, authService });
    const now = new Date("2026-03-03T00:00:00.000Z");

    const result = await service.createWorkspace({
      sessionToken: "session-token",
      request: {
        name: "Acme",
        slug: "acme"
      },
      now
    });

    expect(result.workspace.slug).toBe("acme");
    expect(authService.requireSessionActor).toHaveBeenCalledWith({
      sessionToken: "session-token",
      now
    });
    expect(repository.insertAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "workspace.create",
        actorUserId: "usr-1"
      })
    );
  });

  it("reads members and supports invite acceptance", async () => {
    const service = buildService({});
    const now = new Date("2026-03-03T00:00:00.000Z");

    const members = await service.listWorkspaceMembers({
      sessionToken: "session-token",
      workspaceSlug: "acme",
      now
    });
    expect(members.members).toHaveLength(1);

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

  it("maps workspace creation slug conflicts to an API error", async () => {
    const service = buildService({
      repository: createRepositoryStub({
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
});
