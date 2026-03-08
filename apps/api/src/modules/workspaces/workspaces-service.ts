import type { WorkspaceCreateRequest, WorkspaceInviteCreateRequest } from "@compass/contracts";
import {
  ApiError,
  hashValue,
  normalizeEmail,
  nowPlusSeconds,
  randomToken,
  type WorkspaceRecord
} from "../auth/auth-core.js";
import type { AuthRepository, AuthService } from "../auth/auth-service.js";
import {
  WorkspaceCreateRequestSchema,
  WorkspaceInviteCreateRequestSchema
} from "./workspaces-schemas.js";

type SessionActorResolver = Pick<AuthService, "requireSessionActor">;

export class WorkspacesService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly authService: SessionActorResolver
  ) {}

  async createWorkspace(input: {
    sessionToken: string | null;
    now: Date;
    request: WorkspaceCreateRequest;
  }): Promise<{
    workspace: WorkspaceRecord;
    membership: { role: "admin" | "member"; status: "active" | "invited" | "disabled" };
  }> {
    const context = await this.authService.requireSessionActor({
      sessionToken: input.sessionToken,
      now: input.now
    });
    const request = WorkspaceCreateRequestSchema.parse(input.request);

    try {
      const created = await this.repository.createWorkspace({
        userId: context.userId,
        request,
        now: input.now
      });

      await this.repository.insertAuditEvent({
        eventType: "workspace.create",
        actorUserId: context.userId,
        tenantId: created.workspace.organizationId,
        metadata: {
          workspaceSlug: created.workspace.slug,
          organizationSlug: created.workspace.organizationSlug
        },
        now: input.now
      });

      return created;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("workspaces_unique_slug")) {
        throw new ApiError(409, "WORKSPACE_SLUG_CONFLICT", "Workspace slug already exists");
      }
      throw error;
    }
  }

  async readWorkspace(input: {
    sessionToken: string | null;
    workspaceSlug: string;
    now: Date;
  }): Promise<{ workspace: WorkspaceRecord }> {
    const context = await this.authService.requireSessionActor({
      sessionToken: input.sessionToken,
      now: input.now
    });

    const membership = await this.repository.requireWorkspaceMembership({
      workspaceSlug: input.workspaceSlug,
      userId: context.userId
    });

    if (!membership || membership.membershipStatus !== "active") {
      throw new ApiError(403, "WORKSPACE_FORBIDDEN", "You are not a member of this workspace");
    }

    const workspace = await this.repository.findWorkspaceBySlug(input.workspaceSlug);
    if (!workspace) {
      throw new ApiError(404, "WORKSPACE_NOT_FOUND", "Workspace not found");
    }

    return { workspace };
  }

  async listWorkspaceMembers(input: {
    sessionToken: string | null;
    workspaceSlug: string;
    now: Date;
  }): Promise<{
    members: Array<{
      userId: string;
      primaryEmail: string | null;
      displayName: string | null;
      role: "admin" | "member";
      status: "active" | "invited" | "disabled";
    }>;
  }> {
    const context = await this.authService.requireSessionActor({
      sessionToken: input.sessionToken,
      now: input.now
    });

    const membership = await this.repository.requireWorkspaceMembership({
      workspaceSlug: input.workspaceSlug,
      userId: context.userId
    });

    if (!membership || membership.membershipStatus !== "active") {
      throw new ApiError(403, "WORKSPACE_FORBIDDEN", "You are not a member of this workspace");
    }

    const members = await this.repository.listWorkspaceMembers(membership.workspaceId);
    return { members };
  }

  async createWorkspaceInvite(input: {
    sessionToken: string | null;
    workspaceSlug: string;
    now: Date;
    request: WorkspaceInviteCreateRequest;
  }): Promise<{ inviteId: string; expiresAt: string; token: string }> {
    const context = await this.authService.requireSessionActor({
      sessionToken: input.sessionToken,
      now: input.now
    });
    const request = WorkspaceInviteCreateRequestSchema.parse(input.request);

    const membership = await this.repository.requireWorkspaceMembership({
      workspaceSlug: input.workspaceSlug,
      userId: context.userId
    });

    if (!membership || membership.membershipStatus !== "active") {
      throw new ApiError(403, "WORKSPACE_FORBIDDEN", "You are not a member of this workspace");
    }

    if (membership.isPersonal) {
      throw new ApiError(403, "INVITE_FORBIDDEN", "Personal workspaces cannot be shared directly");
    }

    if (membership.membershipRole !== "admin") {
      throw new ApiError(403, "INVITE_FORBIDDEN", "Only workspace admins can invite users");
    }

    const token = randomToken(24);
    const tokenHash = hashValue(token);
    const expiresInDays = request.expiresInDays ?? 7;
    const expiresAt = nowPlusSeconds(input.now, expiresInDays * 24 * 60 * 60);

    const created = await this.repository.createWorkspaceInvite({
      workspaceId: membership.workspaceId,
      emailNormalized: normalizeEmail(request.email),
      role: request.role,
      tokenHash,
      invitedByUserId: context.userId,
      expiresAt
    });

    await this.repository.insertAuditEvent({
      eventType: "workspace.invite.create",
      actorUserId: context.userId,
      tenantId: membership.organizationId,
      metadata: {
        inviteId: created.inviteId,
        role: request.role,
        email: normalizeEmail(request.email),
        workspaceSlug: membership.workspaceSlug
      },
      now: input.now
    });

    return {
      inviteId: created.inviteId,
      expiresAt: created.expiresAt,
      token
    };
  }

  async acceptWorkspaceInvite(input: {
    sessionToken: string | null;
    workspaceSlug: string;
    inviteToken: string;
    now: Date;
  }): Promise<{
    joined: boolean;
    workspaceSlug: string;
    role: "admin" | "member";
    status: "active" | "invited" | "disabled";
  }> {
    const context = await this.authService.requireSessionActor({
      sessionToken: input.sessionToken,
      now: input.now
    });
    const invite = await this.repository.findWorkspaceInviteByToken({
      workspaceSlug: input.workspaceSlug,
      tokenHash: hashValue(input.inviteToken)
    });

    if (!invite) {
      throw new ApiError(404, "INVITE_NOT_FOUND", "Invite not found");
    }

    if (new Date(invite.expiresAt).getTime() <= input.now.getTime()) {
      throw new ApiError(410, "INVITE_EXPIRED", "Invite has expired");
    }

    const alreadyAcceptedByCurrentUser =
      invite.acceptedAt !== null && invite.acceptedByUserId === context.userId;
    if (!alreadyAcceptedByCurrentUser) {
      const userEmails = await this.repository.listUserKnownEmails(context.userId);
      if (!userEmails.includes(invite.emailNormalized)) {
        throw new ApiError(
          403,
          "INVITE_EMAIL_MISMATCH",
          "Invite email does not match authenticated user"
        );
      }
    }

    const acceptResult = await this.repository.markWorkspaceInviteAcceptedAndUpsertMembership({
      inviteId: invite.id,
      workspaceId: invite.workspaceId,
      organizationId: invite.organizationId,
      userId: context.userId,
      role: invite.role,
      now: input.now
    });

    if (acceptResult === "already_accepted_different_user") {
      throw new ApiError(
        409,
        "INVITE_ALREADY_ACCEPTED",
        "Invite has already been accepted by another user"
      );
    }

    await this.repository.insertAuditEvent({
      eventType: "workspace.invite.accept",
      actorUserId: context.userId,
      tenantId: invite.organizationId,
      metadata: {
        inviteId: invite.id,
        workspaceSlug: invite.workspaceSlug
      },
      now: input.now
    });

    return {
      joined: true,
      workspaceSlug: invite.workspaceSlug,
      role: invite.role,
      status: "active"
    };
  }
}

export function buildDefaultWorkspacesService(input: {
  repository: AuthRepository | null;
  authService: SessionActorResolver | null;
}): WorkspacesService | null {
  if (!input.repository || !input.authService) {
    return null;
  }

  return new WorkspacesService(input.repository, input.authService);
}
